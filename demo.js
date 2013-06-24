
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
		console.log('drawing images markup');
		$field.html(jhaml.templates.imageResults({images: images}));
		go();
	}

	var ww0 = 0, wt0 = 0;
	function startPolling() {
		ww0 = $(window).width();
		wt0 = 0;
		function loop() {
			var ww1 = $(window).width();
			var now = new Date().getTime();
			if(ww1 != ww0) {
				wt0 = now;
				ww0 = ww1;
			} else if(wt0 > 0 && wt0 + 1000 <= now ) {
				console.log('calling planePack on resize');
				$('#field').planePack(function(layout) {
					console.log('finished planePack on resize!');
					console.log(JSON.stringify(layout.packing.report(), null, '   '));
				});
				wt0 = 0;
			}
			setTimeout(loop, 400);
		}
		loop();
	}

	function go() {
		if(parsedLocation.query.mode == 'profile') {
			profile();
		} else {
			var $field = $('#field');
			console.log('calling planePack');
			$field.planePack(function(layout) {
				console.log('finished planePack!');
				console.log(JSON.stringify(layout.packing.report(), null, '   '));
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

	var fin = _.after(2, drawImages);
	loadData(fin);
	loadTemplates(fin);

});