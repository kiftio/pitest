var PitestTreeMap = function() {};

PitestTreeMap.prototype.draw = function(containerId, size, root) {

    var margin = {top: 20, right: 0, bottom: 0, left: 0};
    var width = size.width;
    var height = size.height - margin.top - margin.bottom;
    var formatNumber = d3.format(",d");
    var transitioning;

    var x = d3.scale.linear()
        .domain([0, width])
        .range([0, width]);

    var y = d3.scale.linear()
        .domain([0, height])
        .range([0, height]);

    var treemap = d3.layout.treemap()
        .children(function(d, depth) {
            return depth ? null : d._children;
        })
        .sort(function(a, b) {
            return a.value - b.value;
        })
        .ratio(height / width * 0.5 * (1 + Math.sqrt(5)))
        .round(false);

    var svg = d3.select("#" + containerId).append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.bottom + margin.top)
        .style("margin-left", -margin.left + "px")
        .style("margin.right", -margin.right + "px")
        .append("g")
        .attr("transform", "translate(" + margin.left + "," + margin.top + ")")
        .style("shape-rendering", "crispEdges");

    var grandparent = svg.append("g")
        .attr("class", "grandparent");

    grandparent.append("rect")
        .attr("y", -margin.top)
        .attr("width", width)
        .attr("height", margin.top);

    grandparent.append("text")
        .attr("x", 6)
        .attr("y", 6 - margin.top)
        .attr("dy", ".75em");

    initialize(root);
    accumulate(root);
    layout(root);
    display(root);

    function initialize(root) {
        root.x = 0;
        root.y = 0;
        root.dx = width;
        root.dy = height;
        root.depth = 0;
    }

    function accumulate(d) {
        return (d._children = d.children)
            ? d.value = d.children.reduce(function(p, v) {
                return p + accumulate(v);
            }, 0)
            : d.value;
    }

    function calcChildCoverage(d) {
        function markTotalMutations(node){
            return node._children != null && node._children != undefined
                ? node.numberOfMutations = node._children.reduce(function(p, v) {
                    return p + markTotalMutations(v);
                }, 0)
                : node.numberOfMutations;
        }
        function markMutationsDetected(node) {
            return node._children != null && node._children != undefined
                ? node.numberOfMutationsDetected = node._children.reduce(function(p, v) { return p + markMutationsDetected(v); }, 0)
                : node.numberOfMutationsDetected;
        }
        function markAverageCoverage(node) {
            if (node._children) {
                node._children.forEach(function(ele) {
                    markAverageCoverage(ele);
                });
            }
            node.averageMutationCoverage = node.numberOfMutationsDetected / (node.numberOfMutations / 100);
        }
        markTotalMutations(d);
        markMutationsDetected(d);
        markAverageCoverage(d);
    }


    function layout(d) {
        if (d._children) {
            treemap.nodes({_children: d._children});
            d._children.forEach(function(c) {
                c.x = d.x + c.x * d.dx;
                c.y = d.y + c.y * d.dy;
                c.dx *= d.dx;
                c.dy *= d.dy;
                c.parent = d;
                layout(c);
            });
        }
    }

    function display(d) {
        grandparent
            .datum(d.parent)
            .on("click", transition)
            .select("text")
            .text(name(d).replace(/^\./, ''));

        var g1 = svg.insert("g", ".grandparent")
            .datum(d)
            .attr("class", "depth");

        var g = g1.selectAll("g")
            .data(d._children)
            .enter().append("g");

        g.filter(function(d) { return d._children; })
            .classed("children", true)
            .on("click", transition);

        calcChildCoverage(d);
        var rgb = new PitestColorMapper().mapToColor(d.averageMutationCoverage);

        g.selectAll(".child")
            .data(function(d) {
                return d._children || [d];
            })
            .enter().append("rect")
            .attr("class", "child")
            .call(rect);

        g.append("rect")
            .attr("class", "parent")
            .style("fill", "rgb(" + rgb.red + "," + rgb.green + "," + rgb.blue + ")")
            .call(rect)
            .append("title")
            .text(function() {
                return formatNumber(d.averageMutationCoverage);
            });

        g.append("text")
            .attr("dy", ".75em")
            .text(function(d) {
                return d.name + " " + Math.round(d.averageMutationCoverage) + "%";
            })
            .call(text);

        function transition(d) {
            if (transitioning || !d) {
                return;
            }
            transitioning = true;

            var g2 = display(d);
            var t1 = g1.transition().duration(750);
            var t2 = g2.transition().duration(750);

            // Update the domain only after entering new elements.
            x.domain([d.x, d.x + d.dx]);
            y.domain([d.y, d.y + d.dy]);

            // Enable anti-aliasing during the transition.
            svg.style("shape-rendering", null);

            // Draw child nodes on top of parent nodes.
            svg.selectAll(".depth").sort(function(a, b) { return a.depth - b.depth; });

            // Fade-in entering text.
            g2.selectAll("text").style("fill-opacity", 0);

            // Transition to the new view.
            t1.selectAll("text").call(text).style("fill-opacity", 0);
            t2.selectAll("text").call(text).style("fill-opacity", 1);
            t1.selectAll("rect").call(rect);
            t2.selectAll("rect").call(rect);

            // Remove the old node when the transition is finished.
            t1.remove().each("end", function() {
                svg.style("shape-rendering", "crispEdges");
                transitioning = false;
            });
        }
        return g;
    }

    function text(text) {
        text.attr("x", function(d) { return x(d.x) + 6; })
            .attr("y", function(d) { return y(d.y) + 6; });
    }

    function rect(rect) {
        rect.style("fill", function(d) {
                var rgb = new PitestColorMapper().mapToColor(d.averageMutationCoverage);
                return "rgb(" + rgb.red + "," + rgb.green + "," + rgb.blue + ")";
            })
            .attr("x", function(d) {
                return x(d.x);
            })
            .attr("y", function(d) {
                return y(d.y);
            })
            .attr("width", function(d) {
                return x(d.x + d.dx) - x(d.x);
            })
            .attr("height", function(d) {
                return y(d.y + d.dy) - y(d.y);
            });
     }

    function name(d) {
        return d.parent
            ? name(d.parent) + "." + d.name
            : d.name.replace(/^root/, '');
    }
};

var PitestColorMapper = function() {
};

PitestColorMapper.prototype.mapToColor = function(coveragePercent) {
    function getRed(i) {
        var percent = i / 100;
        return clip(percent * 255 * 2);
    }

    function getGreen(i) {
        var percent = i / 100;
        return clip((255 - (percent * 255)) * 2);
    }

    function clip(num) {
        return num > 255 ? num : num;
    }

    if (coveragePercent === null || coveragePercent === undefined) {
        return {
            "red": 225,
            "green": 225,
            "blue": 225
        };
    }
    return {
        "red": Math.round(getRed(100 - coveragePercent)),
        "green": Math.round(getGreen(100 - coveragePercent)),
        "blue": 0
    };
};

var PitestTreeBuilder = function() {};
PitestTreeBuilder.prototype.buildTree = function(packageParts, hierarchy, coverageData) {
    function buildLeafNode(name, data) {
        return {
            "name": name,
            "value": data.lines,
            "mutationCoverage": data.coverage,
            "numberOfMutations": data.mutations,
            "numberOfMutationsDetected": data.detected,
        };
    }

    function buildInnerNode(name, children) {
        return {
            "name": packageParts[i],
            "children": children
        };
    }

    function packageNameAlreadyInHierarchy(hierarchy, packageName) {
        return hierarchy.filter(package => package.name === packageName).length > 0;
    }

    function isAClass(currentIndex, packageParts) {
        return currentIndex === packageParts.length -1; // last element is the classname
    }

    var currentLevel = [hierarchy];
    for (var i = 0; i < packageParts.length; i++) {
        if (!packageNameAlreadyInHierarchy(currentLevel, packageParts[i])) {
            if (!isAClass(i, packageParts)) {
                var x = [];
                currentLevel.push(buildInnerNode(packageParts[i], x));
                currentLevel = x;
            } else {
                currentLevel.push(buildLeafNode(packageParts[i], coverageData));
            }
        } else {
            var existingNode = currentLevel.find(e => e.name == packageParts[i]);
            if (!existingNode.children) {
                existingNode.children = [];
            }
            currentLevel = existingNode.children;
        }
    }
    return hierarchy;
};
