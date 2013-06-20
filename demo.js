
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

	function drawImages() {
		var $field = $('#field');
		console.log('decorating image objects')
		_.each(images, function(image) { 
			image.relativeSize = 5 + image.tokens.length;
		});
		console.log('drawing images markup');
		$field.html(jhaml.templates.imageResults({images: images}));
		console.log('calling planePack');
		$field.planePack(function() {
			console.log('finished planePack!');
			startPolling();
		});
		console.log('called planePack');
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
				$('#field').planePack(function() {
					console.log('finished planePack on resize!');
				});
				wt0 = 0;
			}
			setTimeout(loop, 400);
		}
		loop();
	}

	var fin = _.after(2, drawImages);
	loadData(fin);
	loadTemplates(fin);

});