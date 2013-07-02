
requirejs.config({
	shim: {
    	underscore: {
      		exports: '_'
    	}
    },
	paths: {
		jquery : 'http://ajax.googleapis.com/ajax/libs/jquery/1.10.0/jquery',
		underscore: 'node_modules/underscore/underscore',
		jhaml: 'node_modules/jhaml/jhaml',
		less: 'node_modules/less/dist/less-1.4.0'
	}
});

require(['jhaml', 'planepacker', 'underscore', 'jquery', 'less'], function(Jhaml, PP, _, $) {
	var jhaml = new Jhaml();
	var images = null;
	var apiBaseUrl = "http://joelangeway-env.elasticbeanstalk.com/imgsearch/api/search";

	function loadTemplates(cb) {
		$.ajax({
			url:'./demo.jhaml', 
			dataType:'text', 
			success: function(src) {
				jhaml.compile(src);
				cb();
			}
		});
	}

	function loadData(cb) {
		$.ajax({
			dataType: 'jsonp',
			data: {query: ''},
			url: apiBaseUrl,
			success: function(data) {
				images = data.images;
				cb();
			}
		});
	}

	function parseLocation() {
		var href = '' + document.location.href
			, m = href.match(/^(\w+):\/\/([^\/]+)(\/[^?]*)(?:\?(.*))?$/)
			, scheme = m[1]
			, domain = m[2]
			, path = m[3]
			, queryString = m[4]
			, query = queryString ? _.reduce(queryString.split(/[&?]/), function(q, kv) {
					var m;
					if(!kv || !(m = kv.match(/^([^=]+)=([^&?]*)$/))) return q;
					q[decodeURIComponent(m[1])] = decodeURIComponent(m[2]);
					return q;
				}, {}) : {}
			;
		return {scheme: scheme, domain: domain, path: path, queryString: queryString, query: query};
	}

	var parsedLocation = parseLocation();

	function drawImages() {
		var $field = $('#field');
		console.log('decorating image objects')
		var rsp = parsedLocation.query.relsize;
		_.each(images, function(image) { 
			image.relativeSize = rsp == '0' ? 1 : 5 + image.tokens.length;
		});
		images = _.sortBy(images, function(image) { return 0 - image.relativeSize; });
		//var sampleImages = _.shuffle(images).slice(0, 25);
		var sampleImages = images;
		console.log('drawing images markup');
		$field.html(jhaml.templates.imageResults({images: sampleImages}));
		go();
	}

	function go() {
		if(parsedLocation.query.mode == 'profile') {
			profile();
		} else if(parsedLocation.query.mode == 'preserve') {
			preserving_profile();
		} else {
			var $field = $('#field');
			console.log('calling planePack');
			var t0 = new Date().getTime();
			$field.planePack(function(layout) {
				var t1 = new Date().getTime();
				var report = {wallClockTime: (t1 - t0), solutions: layout.packing.solutions}
				console.log('finished planePack!');
				window.planePackerPackingReport = report;
				window.planePackerReportDigest = digestReport(report)
				console.log('set window.planePackerPackingReport and planePackerReportDigest');
			});
			console.log('called planePack');
		}
	}

	_.mixin({
		ffMapper: function(s) {
			if(_.isString(s)) {
				var ss = _.compact(s.split('.')), n = ss.length;
				return function(v) {
					for(var i = 0; i < n && v; i++) {
						v = v[ ss[i] ];
					}
					return v;
				}
			} else {
				return s;
			}
		},
		sum: function(list, iter, context) {
			if(iter) {
				iter = _.ffMapper(iter);
				list = _.map(list, iter, context);
			}
			return _.reduce(list, function(a, b) { return a + b; }, 0);
		},
		avg: function(list, iter, context) {
			if(iter) {
				iter = _.ffMapper(iter);
				list = _.map(list, iter, context);
			}
			var total = 0.0, n = 0;
			_.each(list, function(v) {
				total += v;
				n++;
			});
			return total / Math.max(1, n);
		},
		stddev: function(list, iter, context) {
			if(iter) {
				iter = _.ffMapper(iter);
				list = _.map(list, iter, context);
			}
			var m = _.avg(list)
				, n = 0
				, totalDiff2 = 0.0
				;
			_.each(list, function(v) {
				var d = v - m;
				totalDiff2 += d * d;
				n++;
			});
			return Math.sqrt(totalDiff2 / Math.max(1, n));
		},
		stat: function(list, iter, context) {
			if(iter) {
				iter = _.ffMapper(iter);
				list = _.map(list, iter, context);
			}
			return { min: _.min(list), avg: _.avg(list), stddev: _.stddev(list), max: _.max(list), n: _.size(list) };
		},
		rstat: function(list, iter, context) {
			if(iter) {
				iter = _.ffMapper(iter);
				list = _.map(list, iter, context);
			}
			var n = _.sum(list, 'n');
			var mean = _.sum( _.map(list, function(s) { return s.avg * s.n; })) / n;
			var ex2 = _.sum( _.map(list, function(s) { return (s.avg * s.avg + s.stddev * s.stddev) * s.n; })) / n;
			var v = ex2 - mean * mean
				, stddev = Math.sqrt(v)
				;
			return { 
				min: _.min(_.pluck(list, 'min')), 
				avg: mean, 
				stddev: stddev, 
				max: _.max(_.pluck(list, 'max')), 
				n: n
			};
		},
		rstatbags: function(list, iter, context) {
			if(iter) {
				iter = _.ffMapper(iter);
				list = _.map(list, iter, context);
			}
			var keys = _.keys(list[0])
				, stats = _.reduce(keys, function(stats, key) {
						stats[key] = _.rstat(list, key);
						return stats;
					}, {})
				;
			return stats;
		}
	})
	function digestReport(report) {
		var solutions = report.solutions
			, n = solutions.length
			, infos = _.pluck(solutions, 'info')
			, lastInfo = infos[n - 1]
			, timePacking = lastInfo.t
			, totalIterations = lastInfo.iterations
			, totalRunThroughs = lastInfo.nRunThroughs
			, bestScore = _.max(_.pluck(infos, 'score'))
			, bestInfo = _.find(infos, function(info) { return info.score == bestScore; })
			, bestIndex = _.indexOf(infos, bestInfo)
			, stat = function(p) { return _.stat(infos, p); }
			;
		function statPerThingCosts(solution) {
			var costss = _.pluck(_.pluck(solution.placements, 'protoPlacement'), 'costs')
				, keys = _.keys(costss[0])
				, stats = _.reduce(keys, function(stats, key) {
						stats[key] = _.stat(costss, key);
						return stats;
					}, {})
				;
			return stats;
		}

		return {
			wallClockTime: report.wallClockTime,
			timePacking: timePacking,
			nSolutions: n,
			nRunThroughs: totalRunThroughs,
			iterations: totalIterations,
			runThroughsPerSolution: totalRunThroughs / n,
			iterationsPerRunThrough: totalIterations / totalRunThroughs,
			iterationsPerSolution: totalIterations / n,
			iterationPerMs: totalIterations / timePacking,
			runThroughsPerMs: totalRunThroughs / timePacking,
			first: {
				score: infos[0].score,
				index: 0,
				t: infos[0].t,
				nRunThroughs: infos[0].nRunThroughs,
				iterations: infos[0].iterations,
				sizeCost: infos[0].sizeCost,
				cropCost: infos[0].cropCost,
				positionCost: infos[0].positionCost,
				columninessCost: infos[0].columninessCost,
				worstTotalCost: infos[0].worstTotalCost,
				perThingCosts: statPerThingCosts(solutions[0])
			},
			best: {
				score: bestInfo.score,
				index: bestIndex,
				t: bestInfo.t,
				nRunThroughs: bestInfo.nRunThroughs,
				iterations: bestInfo.iterations,
				sizeCost: bestInfo.sizeCost,
				cropCost: bestInfo.cropCost,
				positionCost: bestInfo.positionCost,
				columninessCost: bestInfo.columninessCost,
				worstTotalCost: bestInfo.worstTotalCost,
				perThingCosts: statPerThingCosts(solutions[bestIndex])
			},
			all: {
				score: stat('score'),
				dt: stat('dt'),
				dIterations: stat('dIterations'),
				dRunThroughs: stat('dRunThroughs'),
				iterPerMS: stat('iterPerMS'),
				
				sizeCost: stat('sizeCost'),
				cropCost: stat('cropCost'),
				positionCost: stat('positionCost'),
				columninessCost: stat('columninessCost'),
				worstTotalCost: stat('worstTotalCost'),

				perThingCosts: _.rstatbags(_.map(solutions, statPerThingCosts))
			}
		}
	}

	function aggregateDigests(digests) {
		var ps1 = ('wallClockTime timePacking nSolutions nRunThroughs iterations runThroughsPerSolution iterationsPerRunThrough ' + 
					'iterationsPerSolution iterationPerMs runThroughsPerMs').split(' ')
			, ps2 = 'score index t nRunThroughs iterations sizeCost cropCost positionCost columninessCost worstTotalCost'.split(' ')
			, ps3 = 'score dt dRunThroughs dIterations iterPerMS sizeCost cropCost positionCost columninessCost worstTotalCost'.split(' ')
			, agg = {}
			;
		_.each(ps1, function(p) {
			agg[p] = _.stat(digests, p);
		});
		agg.all = {};
		_.each(ps3, function(p) {
			agg.all[p] = _.stat(digests, 'all.' + p + '.avg');
		});
		agg.first = {};
		_.each(ps2, function(p) {
			agg.first[p] = _.stat(digests, 'first.' + p);
		});
		agg.best = {};
		_.each(ps2, function(p) {
			agg.best[p] = _.stat(digests, 'best.' + p);
		});
		agg.all.perThingCosts = _.rstatbags(digests, 'best.perThingCosts');
		return agg;
	}

	function printAggregateSummary(agg) {
		function stat2str(stat) {
			return stat.avg.toFixed(3) + ' +- ' + stat.stddev.toFixed(3) + ' (' + stat.min.toFixed(1) + ' < ' + stat.max.toFixed(1) + ')';
		}
		var fields = 'timePacking nSolutions nRunThroughs iterations iterationsPerSolution iterationPerMs best.score best.index'.split(' ');
		var opt = '';
		_.each(fields, function(field) {
			opt += field + ': ' + stat2str(_.ffMapper(field)(agg)) + "\n";
		});	
		console.log(opt);
	}

	function profile() {
		var reports = window.planePackerProfilingReports = [];
		var n = (parsedLocation.query.count || 10) - 0;
		console.log('Beginning ' + n + ' profiling runs');
		var $field = $('#field');
		function loop(i) {
			if(i >= n) {
				console.log('Done with ' + n + ' profiling runs');
				console.log( JSON.stringify( aggregateDigests( _.map(reports, digestReport)), null, '  ') );
				return;
			}
			$field.removeData('ppLayoutRoot');
			$field.children('.pp-able').each(function() { $(this).removeData('ppThing').removeClass('pp-layedout'); });
			var t0 = new Date().getTime();
			$field.planePack({animationDuration: 0}, function(layout) {
				var t1 = new Date().getTime();
				i++;
				var report = {wallClockTime: (t1 - t0), solutions: layout.packing.solutions}
				reports.push(report);
				console.log('Finished run ' + i + ' wall clock time: ' + (t1 - t0));
				loop(i);
			});
		}
		loop(0);
	}

	function preserving_profile() {
		var reports = window.planePackerProfilingReports = [];
		var n = (parsedLocation.query.count || 10) - 0;
		console.log('Beginning ' + n + ' preserving profiling runs');
		var $field = $('#field');
		function loop(i) {
			if(i >= n) {
				console.log('Done with ' + n + ' profiling runs');
				var digests = window.planePackerReportDigests = _.map(reports, digestReport);
				var agg = window.planePackerAggregateOfReportDigests = aggregateDigests( digests );
				console.log('wrote globals: planePackerProfilingReports, planePackerReportDigests, and planePackerAggregateOfReportDigests');
				printAggregateSummary(agg);
				return;
			}
			if(i % 3 == 0) {
				$field.removeData('ppLayoutRoot');
				$field.children('.pp-able').each(function() { $(this).removeData('ppThing').removeClass('pp-layedout'); });
			}
			$field.css('margin-right', i % 2 ? '' : '100px');
			var t0 = new Date().getTime();
			$field.planePack({animationDuration: 0}, function(layout) {
				var t1 = new Date().getTime();
				i++;
				var report = {wallClockTime: (t1 - t0), solutions: layout.packing.solutions}
				reports.push(report);
				console.log('Finished run ' + i + ' wall clock time: ' + (t1 - t0));
				loop(i);
			});
		}
		loop(0);
	}

	var fin = _.after(2, drawImages);
	loadData(fin);
	loadTemplates(fin);

});