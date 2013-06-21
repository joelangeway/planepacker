/*
 * layouts.js
 */

var window;

define(['underscore', 'jquery'], function(_, $) {

	var nextThingId = 1;
	function Layout($field, opt) {
		if(! ($field instanceof $) && _.isObject($field)) {
			opt = $field;
			$field = opt.$el || (opt.el && $(opt.el)) || null;
		}
		//we don't actually use this ... not sure if we ever will, we pass the $field in everywhere
		this.$field = $field;
		_.each(this.configProps.split(' '), function(p) {
			this[p] = opt.hasOwnProperty(p) ? opt[p] : this[p];
		}, this);
	}
	Layout.Field = (function() {
		function LayoutField(fW, fH) {
			this.fW = fW;
			this.fH = fH;
			
			function fill(n, v) {
				var a = [];
				a.length = n;
				for(var i = 0; i < n; i++)
					a[i] = v;
				return a;
			}
			//lower and upper bounds of first extent of free space in each column
			this.lbs = fill(fW, 0);
			this.ubs = fill(fW, fH);
			//for each cell in field, point to placement occupying it or null if free
			this.cells = fill(fH * fW, null);
			//dictionary of all placements on field by thing id
			this.placements = {};
			//hash of all the placements thus far (used for closed set)
			this.hash = 42589;
		}
		LayoutField.prototype = {
			sq: function(x) { return x * x; },
			hashPlacement: function(x0, y0, w, h) {
				var h = 39119;
				// function mix() {
				// 	h = 0x3fffffff & (((h & 0x0001ffff) << 13) - (0x3fffffff & h) + (h >> 7));
				// }
				h += x0;
				h = 0x3fffffff & (((h & 0x0001ffff) << 13) - (0x3fffffff & h) + (h >> 7)); //mix();
				h += y0;
				h = 0x3fffffff & (((h & 0x0001ffff) << 13) - (0x3fffffff & h) + (h >> 7)); //mix();
				h += w;
				h = 0x3fffffff & (((h & 0x0001ffff) << 13) - (0x3fffffff & h) + (h >> 7)); //mix();
				h += h;
				h = 0x3fffffff & (((h & 0x0001ffff) << 13) - (0x3fffffff & h) + (h >> 7)); //mix();
				return h;
			},
			placeSlice: function(x, y0, y1) {
				var lb = this.lbs[x], ub = this.ubs[x];

				if(lb == y0)
					lb = y1;
				else if(ub >= y1)
					ub = y0;
				//else we were already in the shadow of another hole
				
				if(lb == ub) {
					//we've filled a hole, find next hole
					var cib = x * this.fH;
					lb = y1;
					while(lb < this.fH && this.cells[cib + lb])
						lb++;
					ub = lb;
					while(ub < this.fH && !this.cells[cib + ub])
						ub++;
				}
				this.lbs[x] = lb;
				this.ubs[x] = ub;
			},
			unplaceSlice: function(x, y0, y1) {
				var lb = this.lbs[x], ub = this.ubs[x];

				if(lb == y1)
					lb = y0;
				else if(ub == y0)
					ub = y1;
				else if(lb > y1) {
					lb = y0;
					ub = y1;
				}
				var cib = x * this.fH;
				while(ub < this.fH && !this.cells[cib + ub])
					ub++;
				this.lbs[x] = lb;
				this.ubs[x] = ub;
			},
			place: function(thing, size, place) {
				
				var x0 = place.x0, y0 = place.y0
					, x1 = x0 + size.w, y1 = y0 + size.h
					;
				if(x1 > place.x1 || y1 > place.y1)
					throw new Error('Logic error');
				var placement = {thing: thing, size: size, place: place,
								x0: x0, x1: x1, y0: y0, y1: y1, w: size.w, h: size.h }
				placement.hash = this.hashPlacement(x0, y0, size.w, size.h);
				this.hash += placement.hash;

				for(var x = x0; x < x1; x++) {
					for(var y = y0; y < y1; y++) {
						var ci = x * this.fH + y;
						if(this.cells[ci])
							throw new Error('Logic error');
						this.cells[ci] = placement;
					}
					this.placeSlice(x, y0, y1);
				}
				this.placements[thing.id] = placement;
				return placement;
			},
			unplace: function(placement) {
				var x0 = placement.x0, y0 = placement.y0
					, x1 = placement.x1, y1 = placement.y1
					;
				this.hash -= placement.hash;
				delete this.placements[placement.thing.id];

				for(var x = x0; x < x1; x++) {
					for(var y = y0; y < y1; y++) {
						var ci = x * this.fH + y;
						if(this.cells[ci] !== placement)
							throw new Error('Logic error');
						this.cells[ci] = null;
					}
					this.unplaceSlice(x, y0, y1);
				}
			},
			findPlaces: function(maxWidth) {
				"returns array of places where top left corner is the top most, left most free space remaining"
				"spaces or in order of descending height and ascending width"
				var x0 = 0
					, y0 = this.lbs[0]
					;
				for(var x = 1, xl = this.fW; x < xl; x++) {
					var y = this.lbs[x];
					if(y < y0) {
						x0 = x;
						y0 = y;
					}
				}
				var y1 = this.ubs[x0]
					, places = []
					, x1
					;
				function emit() {
					places.push({x0: x0, x1: x1, w: x1 - x0, y0: y0, y1: y1, h: y1 - y0});
				}
				for(var x1 = x0 + 1; x1 <= this.fW; x1++) {
					if(this.lbs[x1] != y0) {
						emit();
						break;
					}
					var ub = this.ubs[x1];
					if(ub < y1) {
						emit();
						y1 = ub;
					}
				}
				return places;
			},
			findAdjacentPlacements: function(place) {
				var self = this, placements = {};
				function check(ci) {
					var p = self.cells[ci];
					if(!p || placements[p.thing.id]) {
						return;
					}
					placements[p.thing.id] = p;
				}
				var x0 = place.x0 - 1, x1 = place.x1, y0 = place.y0 - 1, y1 = place.y1;
				function checkX(x) {
					var cib = x * self.fH;
					_.each(_.range(y0, y1 + 1), function(y) { check(cib + y); });
				}
				function checkY(y) {
					_.each(_.range(x0, x1 + 1), function(x) { check(x * self.fH + y); });
				}
				if(x0 >= 0) checkX(x0);
				if(x1 < this.fW) checkX(x1);
				if(y0 >= 0) checkX(y0);
				if(y1 < this.fH) checkX(y1);
				return _.values(placements);
			},
			recursiveUnplace: function(placements) {
				var closed = {};
				_.each(placements, function(placements) { closed[ placements.thing.id ] = true; });
				function mark(placement) {
					closed[placement.thing.id] = true;
					placements.push(placement);
				}
				for(var ti = 0; ti < placements.length; ti++) {
					var placement = placements[ti]
					var y = placement.y1;
					for(var x = placement.x0, x1 = placement.x1; x < x1; x++) {
						var placement2 = this.cells[x * this.fH + y];
						if(placement2 && !closed[placement2.thing.id]) {
							mark(placement2);
						}
					}
				}
				for(var ti = placements.length - 1; ti >= 0; ti--) {
					var placement = placements[ti]
					if(placement.fixed)
						continue;
					this.unplace(placement);
				}
				return placements;
			},
			computeComplexityOfPlacement: function(x0, y0, x1, y1) {
				var c = 0.0;
				if(x0 > 0) {
					c -= this.sq(this.lbs[x0 - 1] - this.lbs[x0]);
					c += this.sq(this.lbs[x0 - 1] - y1);
				}
				if(x1 < this.fW) {
					c -= this.sq(this.lbs[x1] - this.lbs[x1]);
					c += this.sq(this.lbs[x1] - y1);
				}
				return c;
			},
			computeMixinessOfPlacement: function(x0, y0, x1, y1) {
				var m0 = 0, m1 = 0, closed = {}
				if(y0 > 0) {
					var y = y0 - 1;
					for(var x = x0; x < x1; x++) {
						var p = this.cells[x * this.fH + y];
						if(p && !closed[p.thing.id]) {
							closed[p.thing.id] = true;
							m0++;
						}
					}
				}
				if(x0 > 0) {
					var x = x0 - 1;
					for(var y = y0; y < y1; y++) {
						var p = this.cells[x * this.fH + y];
						if(p && !closed[p.thing.id]) {
							closed[p.thing.id] = true;
							m1++;
						}
					}
				}
				return m0 * m0 + m1 * m1;
			}
		}
		return LayoutField;
	})();
	Layout.Packing = (function() {
		function Packing(field, things, goalFieldHeight) {
			this.field = field;
			this.things = things;
			this.goalFieldHeight = goalFieldHeight;
			//We do not try to have a perfectly packed bottom, that would be really hard
			//so the field is overallocated a bit, so we use goalFieldHeight to do estimates for appropriate sizing

			this.weights = {
				size: 4.0 //how much we care about getting relatvie sizes correct
				, crop: 10.0 //getting crop correct
				, preserve: 10.0 //preserving the position of things when re-laying-out
				, special: 20.0 //how much we care about special requests
				, complexity: 3.0 //how hard do we try to keep the problem manageable
				, mix: 0.0 //how much do we care about not looking just like pinterest
				, fail: 5.0 //how much do we avoid placements that previously failed to complete
			};

			this.remainingRelativeSize = 0;
			this.remainingGridArea = field.fW * this.goalFieldHeight;
			this.ethings = {}; //proxy for things by id that has extra state attatched, commented below where we populate
			this.thingSizes = []; //tuples of thing and size ordered to optimize search stategy
			this.fieldsClosed = {}; //set of all hashes of field, to keep from looping
			this.maxWidth = 0;
			this.nThingsPlaced = 0;

			this.mcmcMode = true;

			this.failCounts = {}; //map of placement hashes to count of times a partial solution failed when incorperating this placement

			_.each(things, function(thing) {
				
				this.remainingRelativeSize += thing.relativeSize;
				
				var ething = {
					thing: thing
					, id: thing.id
					, pp: thing.placement || null//previous placement to preserver
					, sp: thing.specialPlacement || null //special placement instructions
					, maxCost: 0.0 //the worst possible cost of placing this thing
					, placed: false
					, placement: null
				};

				this.ethings[ ething.id ] = ething;

				_.each(thing.sizes, function(size) {
					this.maxWidth = Math.max(this.maxWidth, size.w, size.h);
					this.thingSizes.push( { ething: ething, size: size } );
				}, this);
				thing.sizes.sort(function(s1, s2) { return s2.h - s1.h; });
			}, this);

			//sort thing sizes in order of descending height
			this.thingSizes.sort(function(ts1, ts2) { return ts2.size.h - ts1.size.h; });

			//for each thing, calculate the total worst possible cost so that we 
			// can call that a gain when we place the thing, that way we are eager 
			// to make good placements instead of scornful of risky ones, otherwise
			// we'd never be able to get something in its special spot
			var samplePlaces = [
				{x0: 0, y0: 0, x1: 1, y1: 1, w: 1, h: 1},
				{x0: this.field.fW - 1, y0: 0, x1: this.field.fW, y1: 1, w: 1, h: 1},
				{x0: 0, y0: this.goalFieldHeight - 1, x1: 1, y1: this.goalFieldHeight, w: 1, h: 1},
				{x0: this.field.fW - 1, y0: this.goalFieldHeight - 1, x1: this.field.fW, y1: this.goalFieldHeight, w: 1, h: 1}
			];
			_.each(this.ethings, function(ething) {
				var thing = ething.thing
					, maxCropCost = 0.0
					, maxSizeCost = 0.0
					, maxPositionCost = 0.0
					;
				_.each(thing.sizes, function(size) {
					maxCropCost = Math.max(maxCropCost, this.priceCrop(ething, size, samplePlaces[0]) );
					maxSizeCost = Math.max(maxSizeCost, this.priceSize(ething, size, samplePlaces[0]) );
				}, this);
				var sampleSize = thing.sizes[0];
				_.each(samplePlaces, function(place) {
					maxPositionCost = Math.max(maxPositionCost, this.pricePosition(ething, sampleSize, place) );
				}, this);
				ething.maxCost = maxCropCost + maxSizeCost + maxPositionCost;
			}, this);
		}

		Packing.prototype = {
			sq: function(x) { 
				return x * x; 
			},
			log: function() {
				window && window.console && window.console.log.apply(window.console, arguments);
			},
			priceCrop: function(ething, size, place) {

				return this.weights.crop * size.cost;
			},
			priceSize: function(ething, size, place) {
				var thing = ething.thing
					, fieldArea = this.field.fW * this.goalFieldHeight
					, sq = this.sq
					;
				if(ething.sp && ething.sp.relativeSize) {
					var gridSizeGoal = fieldArea * ething.sp.relativeSize / this.remainingRelativeSize;
					return this.weights.special * Math.abs(gridSizeGoal - size.w * size.h); 
				}
				else if(ething.sp && ething.sp.w && ething.sp.h) {
					return this.weights.special * Math.sqrt(sq(ething.sp.w - size.w) + sq(ething.sp.h - size.h));
				}
				else if(ething.pp) {
					return this.weights.preserve * Math.sqrt(sq(ething.pp.w - size.w) + sq(ething.pp.h - size.h));
				}
				else {
					var gridSizeGoal = fieldArea * thing.relativeSize / this.remainingRelativeSize;
					return this.weights.size * Math.abs(gridSizeGoal - size.w * size.h);
				}
			},
			pricePosition: function(ething, size, place) {
				var cx = place.x0 + size.w / 2
					, cy = place.y0 + size.h / 2
					, sq = this.sq
					;
				if(ething.sp && ething.sp.cx !== undefined && ething.sp.cy !== undefined) {
					return this.weights.special * Math.sqrt(sq(ething.sp.cx - cx) + sq(ething.sp.cy - cy));
				} 
				else if(ething.sp && ething.sp.x0 !== undefined && ething.sp.y0 !== undefined && 
									ething.sp.w !== undefined && ething.sp.h !== undefined) {
					var scx = ething.sp.x0 + ething.sp.w / 2
						, scy = ething.sp.y0 + ething.sp.h / 2
						;
					return this.weights.special * Math.sqrt(sq(scx - cx) + sq(scy - cy));
				}
				else if(ething.sp && ething.sp.x0 !== undefined && ething.sp.y0 !== undefined) {
					var scx = ething.sp.x0 + size.w / 2
						, scy = ething.sp.y0 + size.h / 2
						;
					return this.weights.special * Math.sqrt(sq(scx - cx) + sq(scy - cy));
				}
				else if(ething.pp) {
					var pcx = ething.pp.x0 + ething.pp.w / 2
						, pcy = ething.pp.y0 + ething.pp.h / 2
						;
					return this.weights.preserve * Math.sqrt(sq(pcx - cx) + sq(pcy - cy));
				} else {
					return 0;
				}
			},
			priceComplexity: function(ething, size, place) {
				return this.weights.complexity * this.field.computeComplexityOfPlacement(
													place.x0, place.y0, place.x0 + size.w, place.y0 + size.h);
			},
			priceMixiness: function(ething, size, place) {
				return -this.weights.mix * this.field.computeMixinessOfPlacement(
													place.x0, place.y0, place.x0 + size.w, place.y0 + size.h);
			},
			pricePreviousFailures: function(ething, size, place) {
				var pHash = 0x000fffff & this.field.hashPlacement(place.x0, place.y0, size.w, size.h);
				return this.weights.fail * (this.failCounts[pHash] || 0);
			},
			scorePlacement: function(ething, size, place) {
				var costs = {crop: 0, size: 0, position: 0, complexity: 0, mix: 0, fail: 0, totalCost: 0, worseCase: 0, score: 0}
					, cost = 0
					;
				cost += costs.crop = this.priceCrop(ething, size, place);
				cost += costs.size = this.priceSize(ething, size, place);
				cost += costs.position = this.pricePosition(ething, size, place);
				cost += costs.complexity = this.priceComplexity(ething, size, place);
				//cost += costs.mix = this.priceMixiness(ething, size, place);
				cost += costs.fail = this.pricePreviousFailures(ething, size, place);
				costs.totalCost = cost;
				costs.worseCase = ething.maxCost;
				costs.score = ething.maxCost - cost;
				return costs;
			},
			findProtoPlacements: function(places) {
				var protoPlacements = []
					;
				//note: places and sizes are both in order of decending height, 
				//		and places is also ordered by ascending width
				var tsi = 0
					, tsn = this.thingSizes.length
					, pi = 0
					, pn = places.length
					; 
				//throw new Error('break!');

				var placeItemsInOrder = false;

				if(placeItemsInOrder) {
					var ti = 0
						, tn = this.things.length
						, thing, ething 
						;
					for(ti = 0; ti < tn; ti++) {
						thing = this.things[ti];
						ething = this.ethings[ thing.id ];
						if(!ething.placed) {
							break;
						}
					}
					if(ti >= tn) {
						return [];
					}
					var sizes = thing.sizes
						, si = 0
						, sn = sizes.length
						;
					while(si < sn) {
						var size = sizes[si]
							, place = places[pi]
							;
						if(size.h > place.h) {
							//we can't fit by height, maybe a shorter size will work
							si++;
						} else if(pi + 1 < pn && places[pi + 1].h >= size.h) {
							//we can make the place shorter and still fit, so do it to maximize availible width
							pi++;
						} else {
							//we are now on the widest place by which this thing fits by height, 
							//if it also fits by width then it is a valid placement
							if(size.w <= place.w) {
								protoPlacements.push({ething: ething, thing: thing, size: size, place: place});
							}
							//whether we fit or not, this size thing is done being considered
							si++;
						}
					}
				} else {
					while(tsi < tsn) {
						var thingSize = this.thingSizes[tsi]
							, ething = thingSize.ething
							, thing = ething.thing
							, size = thingSize.size
							, place = places[pi]
							;
						if(ething.placed) {
							//don't place the thing twice
							tsi++;
						} else if(size.h > place.h) {
							//we can't fit by height, maybe a shorter thingSize will work
							tsi++;
						} else if(pi + 1 < pn && places[pi + 1].h >= size.h) {
							//we can make the place shorter and still fit, so do it to maximize availible width
							pi++;
						} else {
							//we are now on the widest place by which this thing fits by height, 
							//if it also fits by width then it is a valid placement
							if(size.w <= place.w) {
								protoPlacements.push({ething: ething, thing: thing, size: size, place: place});
							}
							//whether we fit or not, this size thing is done being considered
							tsi++;
						}

					}
				}
				return protoPlacements;
			},
			costToPBase: Math.pow(2.0, 1.0 / 1.0), //every 1 points of score is a factor of two in liklihood of placement 
			scoreProtoPlacements: function(protoPlacements) {
				var totP = 0.0, ppi, pp, r, ppn = protoPlacements.length, maxScore = -1e50;
				for(ppi = 0; ppi < ppn; ppi++) {
					pp = protoPlacements[ppi];
					pp.costs = this.scorePlacement(pp.ething, pp.size, pp.place);
					pp.score = pp.costs.score;
					maxScore = Math.max(maxScore, pp.score);
				}
				var minP = 1e-6;
				for(ppi = ppn - 1; ppi >= 0; ppi--) {
					var pp = protoPlacements[ppi]
						, score = pp.score -= maxScore
						, p = pp.p = Math.pow(this.costToPBase, pp.score)
						;
					if(p < minP) {
						protoPlacements.splice(ppi, 1);
					}
					else {
						totP += p;
					}
				}
				
				if(isNaN(totP))
					throw new Error('totP is NaN!');
				return totP;
			},
			sampleProtoPlacement: function(protoPlacements, totP) {
				"selects one protoPlacement with probability proportional to 'p' property of protoPlacements and returns index, totP must be exact sum of 'p's"
				var ppi, ppn, pp, r;
				ppn = protoPlacements.length;
				if(ppn < 1) { 
					return -1;
				}
				if(ppn == 1) {
					return 0;
				}
				if(totP <= 0) {
					throw new Error('Numerical stabilty error');	
				}
				do {
					r = Math.random() * totP;
					for(ppi = 0; ppi < ppn; ppi++) {
						pp = protoPlacements[ppi];
						r -= pp.p;
						if(r < 0.0)
							break;
					}
				} while(ppi >= ppn); //loop in case floating point screwed us up
				return ppi;
			},
			iterate: function() {
				"Will either place one thing or remove a few things"
				var places = this.field.findPlaces(this.maxLength)
					, protoPlacements = this.findProtoPlacements(places)
					, totP = this.scoreProtoPlacements(protoPlacements) //will splice some protoPlacements out of array because they were too improbable
					, ppn = protoPlacements.length
					;
				var ppi, pp, r, nTries = 0;
				while(ppn > 0) { //loop because we may have to discard options when we find loops						
					nTries++;
					//totP may become inaccurate after some tries because of numerical instability
					if(totP <= 0 || 0 == nTries % 10) {
						totP = 0.0;
						for(ppi = 0; ppi < ppn; ppi++) {
							totP += protoPlacements[ppi].p;
						}
					}
					ppi = this.sampleProtoPlacement(protoPlacements, totP);
					pp = protoPlacements[ppi];

					var placement = this.field.place(pp.thing, pp.size, pp.place);
					if(this.fieldsClosed[this.field.hash]) {
						this.field.unplace(placement);
						totP -= pp.p;
						protoPlacements.splice(ppi, 1);
						ppn--;
					} else {
						pp.ething.placed = true;
						pp.ething.placement = placement;
						pp.ething.protoPlacement = pp;
						this.nThingsPlaced++;
						break;
					}
				}
				if(ppn === 0) {
					if(this.mcmcMode) {
						for(var ti = this.things.length - 1; ti >= 0; ti--) {
							var thing = this.things[ti]
								, ething = this.ethings[ thing.id ]
								;
							if(ething.placed) {
								var pHash = 0x000fffff & ething.placement.hash;
								this.failCounts[pHash] = 1 + (this.failCounts[pHash] || 0);
								this.field.unplace(ething.placement);
								ething.placed = false;
								ething.placement = null;
								ething.protoPlacement = null;
								this.nThingsPlaced--;
							}
						}
						this.fieldsClosed = {};
					} else {
						//there were no valid placements, detinate a bomb to clear space and try again
						var ops = this.field.findAdjacentPlacements(places[ places.length - 1 ]);
						ops = this.field.recursiveUnplace(ops); //unplace these placements and any below them
						for(var i = ops.length - 1; i >= 0; i--) {
							var p = ops[i];
							var ething = this.ethings[p.thing.id];
							ething.placed = false;
							ething.placement = null;
							ething.protoPlacement = null;
							this.nThingsPlaced--;
						}
					}
				}
				this.fieldsClosed[this.field.hash] = true;
			},
			pack: function(maxIterations, maxIterationsWithoutProgress) {
				var mostThingPlaced = 0
					, mostThingPlacedIter = 0
					, nThings = this.things.length
					, t0 = new Date().getTime()
					, self = this
					;
				function beforeReturn(msg) {
					var t1 = new Date().getTime();
					self.log('packing took ' + (t1 - t0) + 'ms, msg: ' + msg)
				}
				this.log('started packing');
				for(var iter0 = 0; iter0 < maxIterations; iter0++) {
					this.iterate();
					if(this.nThingsPlaced == nThings) {
						beforeReturn('success after ' + iter0 + ' iterations');
						return true;
					}
					if(this.nThingsPlaced > mostThingPlaced) {
						mostThingPlaced = this.nThingsPlaced;
						mostThingPlacedIter = iter0;
					}
					if(iter0 - mostThingPlacedIter > maxIterationsWithoutProgress) {
						beforeReturn('failed for lack of progress')
						return false;
					}
				}
				beforeReturn('failed to converge after ' + maxIterations + ' iterations');
				return false;
			},
			getPlacements: function() {
				"returns dictionary of placements by thing id"
				return _.reduce(this.ethings, function(placements, ething) {
					if(ething.placed) {
						placements[ething.id] = ething.placement;
					}
					return placements;
				}, {});
			},
			reportCosts: function() {
				function avgBag(bag, sample) {
					_.each(sample, function(v, p) {
						if(!_.isNumber(v)) return;

						var b = bag[p] || (bag[p] = {n: 0, x: 0, x2: 0, min: v, max: v});
						b.n++;
						b.x += v;
						b.x2 += v * v;
						b.min = Math.min(b.min, v);
						b.max = Math.max(b.max, v);
					});
					return bag;
				}
				var report = {};
				_.chain(this.ethings)
							.map(function(ething) { return ething.protoPlacement.costs; })
							.reduce(avgBag, {})
							.each(function(tot, p) {
								report[p] = { n: tot.n, 
											avg: tot.x / tot.n, 
											stddev: Math.sqrt( (tot.x2 - tot.x * tot.x) / tot.n ),
											min: tot.min,
											max: tot.max
										};
							});
				return report;
			}
		}
		return Packing;
	})();
	Layout.prototype = {
		configProps: 'cssPrefix cssLayoutable cssLayoutDone cssImageMark cssWaitingForContent ' +
					'dataThingType dataRelativeSize dataNativeWidth dataNativeHeight dataPlacement dataSpecialPlacement ' +
					'padding gridSize minLength maxLength averageThingGridArea animationDuration',
		cssPrefix: 'pp-',
		cssLayoutable: 'able',
		cssLayoutDone: 'laidout',
		cssImageMark: 'image',
		cssBusy: 'busy',
		cssComputing: 'computing',
		cssWaitingForContent: 'waiting-for-content',
		dataThingType: 'lotype',
		dataRelativeSize: 'relative-size',
		dataNativeWidth: 'native-width',
		dataNativeHeight: 'native-height',
		dataPlacement: 'placement',
		dataSpecialPlacement: 'special-placement',
		dataLayoutRoot: 'layout-root',
		padding: 4,
		gridSize: 50,
		minLength: 2,
		maxLength: 10,
		averageThingGridArea: 8,
		animationDuration: 1000,

		log: function() {
			window && window.console && window.console.log.apply(window.console, arguments);
		},

		pixelLength: function (gridLength) { 
			return gridLength * this.gridSize + (gridLength - 1) * this.padding; 
		},
		gridLengthFloor: function(pixelLength) { 
			return Math.floor((pixelLength + this.padding) / (this.gridSize + this.padding)); 
		},
		gridLengthCeil: function(pixelLength) { 
			return Math.ceil((pixelLength + this.padding) / (this.gridSize + this.padding)); 
		},
		getSandbox: function() {
			var $sb = $('#' + this.cssPrefix + 'sandbox');
			if(!$sb.length)
				$sb = $('<div id="' + this.cssPrefix + 'sandbox"></div>').appendTo('body');
			return $sb;
		},
		getViewportHeight: function() {
			return $(window).height();
		},
		fetchNativeSize: function(src, cb) {
			var $img = $('<img class="js-layouts-cacheimg">').appendTo(this.getSandbox());
			$img
				.load(function() {
					cb($img.width(), $img.height());
				})
				.attr('src', src);
		},
		enumerateScales: function(nativeWidth, nativeHeight, crops, padding, gridSize, minLength, maxLength) {
			var scales = []
				, cropWidth = nativeWidth - crops[1] - crops[3]
				, cropHeight = nativeHeight  - crops[0] - crops[2]
				, minAspectRatio = 0.8 * cropWidth / nativeHeight
				, maxAspectRatio = 1.25 * nativeWidth / cropHeight
				;
			function emit(w, h, width, height) {
				return true;
			}
			var maxW = Math.min(maxLength, this.gridLengthFloor(nativeWidth))
				, maxH0 = Math.min(maxLength, this.gridLengthFloor(nativeHeight))
				;
			for( var w = minLength; w <= maxLength; w++) {
				var width = this.pixelLength(w)
					, minH = Math.max(minLength, this.gridLengthCeil( width / maxAspectRatio ))
					, maxH = Math.min(maxH0, this.gridLengthFloor( width / minAspectRatio ))
					;
				for( var h = minH; h <= maxH; h++) {
					var height = this.pixelLength(h);
					var minScale = Math.max(width / nativeWidth, height / nativeHeight);
					if(minScale > 1.0) {
						continue;
					}

					var s, scaledWidth, scaledHeight, offsetLeft, offsetTop, cost;
					
					//cost = square( (s * cropWidth - width) / cropWidth) + square( (s * cropHeight - height) / cropHeight );
					//dCostS = 4 * s - 2 * width / cropWidth - 2 * height / cropHeight
					//min cost(s) @ s = (width / cropWidth + height / cropHeight) / 2
					s = Math.max(minScale, Math.min(1.0, (width / cropWidth + height / cropHeight) / 2));
					scaledWidth = s * nativeWidth;
					scaledHeight = s * nativeHeight;
					offsetLeft = Math.round((width - scaledWidth) * ( (crops[3] + 0.05) / (0.1 + crops[1] + crops[3]) ) );
					offsetTop = Math.round((height - scaledHeight) * ( (crops[0] + 0.05) / (0.1 + crops[0] + crops[2]) ) );
					cost = Math.pow( (s * cropWidth - width) / cropWidth, 2) + Math.pow( (s * cropHeight - height) / cropHeight, 2);
					
					if(isNaN(scaledWidth + scaledHeight + offsetLeft + offsetTop + cost + w + h)) {
						throw new Error('NaN!');
					}

					scales.push({
						w: w, h: h, cost: cost,
						scaledWidth: scaledWidth, scaledHeight: scaledHeight,
						offsetLeft: offsetLeft, offsetTop: offsetTop
					});
				}
			}
			return scales;
		},
		findThings: function($field) {
			var things = []
				, $things = $field.children('.' + this.cssPrefix + this.cssLayoutable)
				, self = this
				;
			function makeThing($thing) {
				var thing = { 
						id: (nextThingId++)
						, $el: $thing
						, type: $thing.data(self.cssPrefix + self.dataThingType)
						, relativeSize: $thing.data(self.cssPrefix + self.dataRelativeSize)
					}
					;
				if(thing.type == 'image') {
					var $img = $thing.find('img.' + self.cssPrefix + self.cssImageMark);
					if(!$img.length)
						throw new Error('Layoutable image must have image mark on an img tag');
					thing.src = $img.attr('src');
					var dimensions = $thing.data(self.cssPrefix + 'dimensions');
					if(dimensions) {
						thing.nativeWidth = dimensions.nativeWidth || 0;
						thing.nativeHeight = dimensions.nativeHeight || 0;
						thing.crops = dimensions.crops || [0, 0, 0, 0];
					} else {
						thing.nativeWidth = ($thing.data(self.cssPrefix + self.dataNativeWidth) || 
												$img.data(self.cssPrefix + self.dataNativeWidth) || 0) - 0;
						thing.nativeHeight = ($thing.data(self.cssPrefix + self.dataNativeHeight) || 
												$img.data(self.cssPrefix + self.dataNativeHeight) ||  0) - 0;
						thing.crops = [0, 0, 0, 0];
					}
					thing.ready = false;
					function afterNativeSize() {
						thing.sizes = self.enumerateScales(thing.nativeWidth, thing.nativeHeight, thing.crops, 
													self.padding, self.gridSize, self.minLength, self.maxLength);
						if(!thing.relativeSize) {
							thing.relativeSize = thing.nativeWidth * thing.nativeHeight / Math.pow(self.gridSize + self.padding, 2);
						}
						thing.ready = true;
					}
					if(!thing.nativeWidth || !thing.nativeHeight) {
						self.fetchNativeSize(thing.src, function(width, height) {
							thing.nativeWidth = width;
							thing.nativeHeight = height;
							afterNativeSize();
						});
					} else
						afterNativeSize();
				} else
					throw new Error('Bad layout type');
				$thing.data(self.cssPrefix + 'thing', thing);
				return thing;
			}
			_.each($things, function(thingEl) {
				var $thing = $(thingEl)
					, thing = $thing.data(this.cssPrefix + 'thing') || makeThing($thing)
					;
				things.push(thing);
			}, this);
			return things;
		},
		waitForThingsToBeReady: function(things, timeout, cb) {
			//this would actually be a great place to be using promises.

			var t0 = new Date().getTime();
			function check() {
				var t1 = new Date().getTime();
				if(_.every(things, function(thing) { return thing.ready; })) {
					return cb(true);
				} else if( t1 > t0 + timeout) {
					return cb(false);
				} else {
					setTimeout(check, Math.min(100, t0 + timeout - t1));
				}
			}
			check();
		},
		packRectangles: function(things, fieldWidth, goalFieldHeight) {
			var field = new Layout.Field(fieldWidth, Math.floor(1.5 * goalFieldHeight))
				, packing = new Layout.Packing(field, things, goalFieldHeight)
				, maxIterWithoutProgress = 10000
				, maxIterPerItem = 100
				, didItWork
				, t0 = new Date().getTime()
				;
			for(var iTry = 0; iTry < 20; iTry++) {
				this.log('Beginning try #' + (1 + iTry))
				didItWork = packing.pack(things.length * maxIterPerItem, maxIterWithoutProgress);
				if(didItWork) {
					break;
				}
				maxIterWithoutProgress += 500;
				maxIterPerItem += 10;
			}
			var t1 = new Date().getTime();
			this.log('Done packing in ' + (t1 - t0) + 'ms');
			this.log('Cost report: ' + JSON.stringify(packing.reportCosts(), null, '   ') + '\n');
			this.field = field;
			this.packing = packing;
			return didItWork ? packing.getPlacements() : null;
		},
		positionRectangles: function(things) {
			var stepsize = this.padding + this.gridSize, maxHeight = 0;
			
			var tweenInterval = 30, minTweenDelay = 5, log = this.log;
			function tween(duration, waypoints, f) {
				if(typeof duration != 'number' || isNaN(duration) || duration <= 0) {
					throw new Error('First argument to tween() must be the positive number of microseconds to tween for.');
				}
				if(f === undefined) {
					f = waypoints;
					waypoints = [0, 1];
				} else {
					if(waypoints.length == 0 || waypoints[0] != 0) {
						waypoints.unshift(0);
					}
					if(waypoints[ waypoints.length - 1] != 1.0) {
						waypoints.push(1.0);
					}
				}
				var n = waypoints.length - 1, t0 = new Date().getTime(), t1 = t0 + duration, tac = 0.0, frames = 0;
				function loop() {
					frames++;
					var ta = new Date().getTime(), tb = tac + ta;
					if(tb >= t1) {
						log('Tweening last frame of ' + frames + ' in ' + duration + 'ms, last frame took ' + tac + 'ms');
						return f(1.0, 1.0);
					}
					var x = Math.max(0, Math.min(1, (tb - t0) / duration))
						, k = x * n
						, i = Math.floor(k)
						, r = k - i
						, wi = waypoints[i]
						, y = wi + r * (waypoints[i + 1] - wi)
						;
					f(y, x);
					var tc = new Date().getTime();
					tac = tc - ta;
					var nMoreFrames = Math.max(1, Math.floor( (t1 - tc) / tweenInterval))
						, delay = nMoreFrames && Math.max(minTweenDelay, Math.round( (t1 - tc) / nMoreFrames - tac))
						;
					nMoreFrames && setTimeout(loop, delay);
				}
				setTimeout(loop, Math.min(t1 - t0, Math.floor(tweenInterval / 2)));
			}

			var anis = [], fades = [];
			_.each(things, function(thing) {
				var $thing = thing.$el
					, placement = thing.placement
					, left = stepsize * placement.x0
					, top = stepsize * placement.y0
					, width = this.pixelLength(placement.w)
					, height = this.pixelLength(placement.h)
					;
				if(isNaN(left + top + width + height)) {
					throw new Error('NaN!');
				}
				maxHeight = Math.max(maxHeight, top + height); 
				var layedout = $thing.hasClass(this.cssPrefix + this.cssLayoutDone);
				if(layedout) {
					var pos = $thing.position() || {left: left, top: top};
					var ani = { el: $thing[0],
								p0: { left: pos.left, top: pos.top, width: $thing.width() || width, height: $thing.height() || height },
								p1: { left: left, top: top, width: width, height: height } };
					anis.push(ani);
				} else {
					fades.push({el: $thing[0]});
					$thing
						.css({ left: left, top: top, width: width, height: height, opacity: 0.0 })
						.addClass(this.cssPrefix + this.cssLayoutDone)
						;
				}
				if(thing.type == 'image') {
					var size = placement.size
						, $img = $thing.find('img.' + this.cssPrefix + this.cssImageMark)
						;
					if(layedout) {
						var pos = $img.position() || {left: size.offsetLeft, top: size.offsetTop};
						var ani = { el: $img[0], 
							p0: { left: pos.left, top: pos.top, width: $img.width() || size.scaledWidth, height: $img.height() || size.scaledHeight },
							p1: { left: size.offsetLeft, top: size.offsetTop, width: size.scaledWidth, height: size.scaledHeight } };
						anis.push(ani);
					} else {
						$img.css({ left: size.offsetLeft, top: size.offsetTop, width: size.scaledWidth, height: size.scaledHeight });
					}
				}
				return ani;
			}, this);
				
			var tweening = [0, 0.09549150281252627, 0.3454915028125263, 0.6545084971874737, 0.9045084971874737, 1];
			var posProps = ['left', 'top', 'width', 'height'];
			tween(this.animationDuration, tweening, function(y, x) {
				for(var i = anis.length - 1; i >= 0; i--) {
					var ani = anis[i]
						, s = ani.el.style
						, p0 = ani.p0
						, p1 = ani.p1
						;
					for(var j = 0; j < 4; j++) {
						var prop = posProps[j]
							, v0 = p0[prop]
							, v1 = p1[prop]
							;
						s[prop] = Math.round(v0 + y * (v1 - v0)) + 'px';				
					}
				}
				var o = x == 1.0 ? '' : x;
				for(var i = fades.length - 1; i >= 0; i--) {
					fades[i].el.style.opacity = o;
				}
			});

			if(this.$field) {
				this.$field.css('min-height', maxHeight);
			}
		},
		scalePreviousPlacements: function(things, previousFieldWidth, currentFieldWidth) {
			var s = currentFieldWidth / previousFieldWidth;
			_.each(things, function(thing) {
				if(thing.placement) {
					thing.placement.x0 *= s;
					thing.placement.x1 *= s;
					thing.placement.w *= s;
					thing.placement.y0 /= s;
					thing.placement.y1 /= s;
					thing.placement.h /= s;
				}
			});
		},
		layout: function($field, cb) {
			var width = $field.width()
				, fieldWidth = this.gridLengthFloor(width)
				, things = this.findThings($field)
				, self = this
				;
			$field.addClass(this.cssPrefix + this.cssBusy);
			$field.addClass(this.cssPrefix + this.cssWaitingForContent);
			
			this.waitForThingsToBeReady(things, 30000, function() {
				var nThings = things.length
					, goalFieldHeight = self.estimateGridHeight(nThings, width)
					;	
				$field.removeClass(this.cssPrefix + this.cssWaitingForContent);
				$field.addClass(this.cssPrefix + this.cssComputing);
				
				if(self.fieldWidth && self.fieldWidth != fieldWidth) {
					self.scalePreviousPlacements(things, this.fieldWidth, fieldWidth);
				}

				var placements = self.packRectangles(things, fieldWidth, goalFieldHeight);
			
				$field.removeClass(this.cssPrefix + this.cssComputing);
				$field.removeClass(this.cssPrefix + this.cssBusy);
			
				_.each(things, function(thing) {
					thing.placement = placements[thing.id];
				});
				self.fieldWidth = fieldWidth;
				self.positionRectangles(things);
				cb();
			});
		},
		estimateGridHeight: function(nThings, width) {
			//we want to average an area of at least 8 grid units per thing
			var w = this.gridLengthFloor(width)
				, h = Math.ceil(nThings * this.averageThingGridArea / w) 
				;
			return h;
		}
	};

	$.fn.extend({
		planePack: function(opt, cb) {
			if(cb === undefined && _.isFunction(opt)) {
				cb = opt;
				opt = {};
			}
			opt = opt || {};
			
			var config = {};
			_.each(Layout.prototype.configProps.split(' '), function(p) {
				config[p] = opt.hasOwnProperty(p) ? opt[p] : Layout.prototype[p];
			}, this);

			var layout = this.data(config.cssPrefix + config.dataLayoutRoot);
			if(!layout) {
				layout = new Layout(this, opt);
				this.data(layout.cssPrefix + layout.dataLayoutRoot, layout);
			}
			
			layout.layout(this, cb || opt.complete || function(){})
		}
	})
	return Layout;
});




