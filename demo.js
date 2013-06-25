
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
		var sampleImages = _.shuffle(images).slice(0, 25);
		console.log('drawing images markup');
		$field.html(jhaml.templates.imageResults({images: sampleImages}));
		go();
	}

	function startPolling() {
		var ww0 = $(window).width()
			, resizing = false
			;
		function loop() {
			var ww1;
			if(!resizing && ww0 != (ww1 = $(window).width())) {
				ww0 = ww1;
				resizing = true;
				console.log('calling planePack on resize');
				$('#field').planePack(function(layout) {
					resizing = false;
					console.log('finished planePack on resize!');
					window.planePackerPackingReport = layout.packing.report();
					console.log('set window.planePackerPackingReport');
					setTimeout(loop, 1);
				});
			}
		}
		$(window).resize(loop);
	}

	function go() {
		if(parsedLocation.query.mode == 'profile') {
			profile();
		} else if(parsedLocation.query.mode == 'preserve') {
			preserving_profile();
		} else {
			var $field = $('#field');
			console.log('calling planePack');
			$field.planePack(function(layout) {
				console.log('finished planePack!');
				window.planePackerPackingReport = layout.packing.report();
				console.log('set window.planePackerPackingReport');
				startPolling();
			});
			console.log('called planePack');
		}
	}

	function profile() {
		var reports = window.planePackerProfilingReports = [];
		var n = (parsedLocation.query.count || 10) - 0;
		console.log('Beginning ' + n + ' profiling runs');
		var $field = $('#field');
		function loop(i) {
			if(i >= n) {
				console.log('Done with ' + n + ' profiling runs');
				function stat(p) {
					var rawValues = _.pluck(reports, p)
						, values = _.filter(rawValues, function(v) { return v === +v && !isNaN(v); })
						, n = values.length
						, nans = rawValues.length - n
						, ordered = _.sortBy(values, function(x) { return x;})
						, median = (ordered[ Math.floor((n - 1) / 2) ] + ordered[ Math.ceil((n - 1) / 2) ]) / 2
						, min = ordered[0]
						, max = ordered[ ordered.length - 1]
						, fsum = function(a) { return _.reduce(a, function(l, r) { return l + r; }, 0); }
						, sum = fsum(ordered)
						, sum2 = fsum(_.map(ordered, function(x) { return x * x; }))
						, mean = sum / n
						, variance = sum2 / n - mean * mean
						, stddev = Math.sqrt(variance)
						;
					console.log('Stat: ' + p + ' ' + min + '  <  ' + median + ' ~ ' + mean + ' +- ' + stddev + '  <  ' + max + '   NANS: ' + nans);
				}
				stat('duration');
				stat('iterations');
				stat('iterationPerMs');
				stat('nClears');
				stat('relativeSizeCorrelation');
				stat('columniness');

				return;
			}
			$field.removeData('ppLayoutRoot');
			$field.children('.pp-able').each(function() { $(this).removeData('ppThing').removeClass('pp-layedout'); });
			var t0 = new Date().getTime();
			$field.planePack({animationDuration: 0}, function(layout) {
				var t1 = new Date().getTime();
				i++;
				var report = layout.packing.report();
				reports.push(report);
				console.log('Finished run ' + i + ' wall clock time: ' + (t1 - t0) + 'ms packing time: ' + report.duration);
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
				function stat(p) {
					var ps = p.split('.')
						, rawValues = reports
						, q
						;
					while(q = ps.shift()) {
						rawValues = _.pluck(rawValues, q);
					}
					var values = _.filter(rawValues, function(v) { return v === +v && !isNaN(v); })
						, n = values.length
						, nans = rawValues.length - n
						, ordered = _.sortBy(values, function(x) { return x;})
						, median = (ordered[ Math.floor((n - 1) / 2) ] + ordered[ Math.ceil((n - 1) / 2) ]) / 2
						, min = ordered[0]
						, max = ordered[ ordered.length - 1]
						, fsum = function(a) { return _.reduce(a, function(l, r) { return l + r; }, 0); }
						, sum = fsum(ordered)
						, sum2 = fsum(_.map(ordered, function(x) { return x * x; }))
						, mean = sum / n
						, variance = sum2 / n - mean * mean
						, stddev = Math.sqrt(variance)
						;
					console.log('Stat: ' + p + ' ' + min + '  <  ' + median + ' ~ ' + mean + ' +- ' + stddev + '  <  ' + max + '   NANS: ' + nans);
				}
				stat('duration');
				stat('iterations');
				stat('iterationPerMs');
				stat('nClears');
				stat('relativeSizeCorrelation');
				stat('columniness');
				stat('costs.complexity.avg');
				stat('costs.crop.avg');
				stat('costs.size.avg');
				stat('costs.position.avg');
				stat('costs.fail.avg');
				stat('costs.columniness.avg');
				stat('costs.totalCost.avg');
				stat('costs.worseCase.avg');
				return;
			}
			$field.css('margin-right', i % 2 ? '' : '50px');
			var t0 = new Date().getTime();
			$field.planePack({animationDuration: 0}, function(layout) {
				var t1 = new Date().getTime();
				i++;
				var report = layout.packing.report();
				reports.push(report);
				console.log('Finished run ' + i + ' wall clock time: ' + (t1 - t0) + 'ms packing time: ' + report.duration);
				loop(i);
			});
		}
		loop(0);
	}

	var fin = _.after(2, drawImages);
	loadData(fin);
	loadTemplates(fin);

});