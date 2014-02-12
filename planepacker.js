/*
 * planepacker.js
 */

var window;

define(['underscore', 'jquery'], function(_, $) {

	_.mixin({
		repeat: function(v, n) {
			var a = Array(n);
			for(var i = 0; i < n; i++)
				a[i] = v;
			return a;
		},
		map2obj: function(a, kf, vf, c) {
			var b = {};
			c = c || null;
			_.each(a, function(v0, k0) {
				var k1 = kf.call(c, v0, k0, a);
				if(k1 === false) {
					return false;
				}
				b[k1] = vf.call(c, v0, k0, a, k1);
			});
			return b;
		}
	});

	var nextThingId = 1;
	function Layout($field, opt) {
		if(! ($field instanceof $) && _.isObject($field)) {
			opt = $field;
			$field = opt.$el || (opt.el && $(opt.el)) || null;
		}
		this.setField($field);
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
			//lower bounds of first extent of free space in each column
			this.lbs = _.repeat(0, fW);
			//for each cell in field, point to placement occupying it or null if free
			this.cells = _.repeat(null, fH * fW);
			//dictionary of all placements on field by thing id
			this.placements = {};
			//hash of all the placements thus far (used for closed set)
			this.hash = 42589;
		}
		LayoutField.prototype = {
			hashPlacement: function(x0, y0, w, h) {
				var a = 783958622; //fixed random seed
				a ^= ((y0 & 0x07ff) << 19) | ((x0 & 0x7f) << 12) | ((w & 0x3f) << 6) | (h & 0x3f)
				a = ((0x00007fff & a) * 22853) ^ ((a >> 15) * 26171);
				a ^= a >> 9;
				return a;
			},
			clear: function() {
				for(var x = this.fW - 1; x >= 0; x--) {
					this.lbs[x] = 0;
				}
				for(var i = this.cells.length - 1; i >= 0; i--) {
					this.cells[i] = null;
				}
				this.placements = {};
				this.hash = 42589;
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
					if(this.lbs[x] != y0) {
						throw new Error('things must be places in top most left most free spot always!');
					}
					this.lbs[x] = y1;
					for(var y = y0; y < y1; y++) {
						var ci = x * this.fH + y;
						if(this.cells[ci])
							throw new Error('Logic error');
						this.cells[ci] = placement;
					}
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
					if(this.lbs[x] != y1) {
						throw new Error('things must be places in top most left most free spot always!');
					}
					this.lbs[x] = y0;
					for(var y = y0; y < y1; y++) {
						var ci = x * this.fH + y;
						if(this.cells[ci] !== placement)
							throw new Error('Logic error');
						this.cells[ci] = null;
					}
				}
			},
			findPlace: function() {
				"returns place where top left corner is the top most, left most free space remaining"
				var x0 = 0
					, y0 = this.lbs[0]
					, w = 1
					, connected = true;
					;
				for(var x = 1, xl = this.fW; x < xl; x++) {
					var y = this.lbs[x];
					if(y < y0) {
						x0 = x;
						y0 = y;
						w = 1;
						connected = true;
					} else if (connected && y == y0) {
						w++;
					} else {
						connected = false;
					}
				}
				return { x0: x0, y0: y0, w: w, h: this.fH - y0, x1: x0 + w, y1: this.fH };
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
			getAdjacentFeatures: function(x0, y0, x1, y1, feats) {
				"returns array of hashcodes of surrounding placements, invarient under many translations"
				var x, y, c, lb, a;
				//decimal magic numbers are arbitrary primes, they must merely be unique to the attribute they encode
				//hex magic numbers are masks to keep us in the realm of ints

				//how far to ledge?
				x = x1;
				lb = this.lbs[x0];
				while(x < this.fW && this.lbs[x] == lb) {
					x++;
				}
				a = 0x3fffffff & (4367 * (x - x1));
				feats.push(a);

				//left ledge?
				x = x0 - 1;
				lb = x >= 0 && this.lbs[x];
				do {
					x--;
				} while(x >= 0 && this.lbs[x] == lb);
				a = 0x3fffffff & (4387 * (x - x1));
				feats.push(a);

				//offset and size of neighbors:
				//western north neighbor
				c = y0 > 0 && this.cells[x0 * this.fH + y0 - 1];
				if(c) {
					a = 0x3fffffff & (4409 * ( 431 * (c.x1 - x0) + 467 * c.w + 517 * c.h ) );
				} else {
					a = 4409;
				}
				feats.push(a);

				//easter north neighbor
				c = y0 > 0 && this.cells[(x1 - 1) * this.fH + y0 - 1];
				if(c) {
					a = 0x3fffffff & (4451 * ( 431 * (c.x1 - x1) + 467 * c.w + 517 * c.h ) );
				} else {
					a = 4451;
				}
				feats.push(a);

				//northern west neighbor
				c = x0 > 0 && this.cells[(x0 - 1) * this.fH + y0];
				if(c) {
					a = 0x3fffffff & (4493 * ( 431 * (c.y1 - y0) + 467 * c.w + 517 * c.h ) );
				} else {
					a = 4493;
				}
				feats.push(a);

				//southern west neighbor
				c = x0 > 0 && this.cells[(x0 - 1) * this.fH + y1 - 1];
				if(c) {
					a = 0x3fffffff & (4541 * ( 431 * (c.y1 - y1) + 467 * c.w + 517 * c.h ) );
				} else {
					a = 4541;
				}
				feats.push(a);
			},
			computeComplexityOfPlacement: function(x0, y0, x1, y1) {
				var c = 0.0, d;
				if(x0 > 0) {
					if(x0 == 1) { return 1e50; }
					var lb1 = this.lbs[x0 - 1], lb2 = this.lbs[x0 - 2];
					if(lb1 < y1 && lb1 < lb2) { return 1e50; }
					d = lb1 - y0;
					c -= d * d;
					d = lb1 - y1;
					c += d * d;
				}
				if(x1 < this.fW) {
					if(x1 + 1 == this.fW) { return 1e50; }
					var lb1 = this.lbs[x1], lb2 = this.lbs[x1 + 1];
					if(lb1 < y1 && lb1 < lb2) { return 1e50; }
					d = lb1 - y0;
					c -= d * d;
					d = lb1 - y1;
					c += d * d;
				}
				return c;
			},
			getUncoveredPlacements: function() {
				var uncovered = {};
				for(var x = this.fW - 1; x >= 0; x--) {
					var y = this.lbs[x] - 1
						, p = y >= 0 && this.cells[x * this.fH + y]
						;
					p && (uncovered[p.thing.id] = p);
				}
				return uncovered;
			},
			getAllPlacements: function() {
				return this.placements;
			},
			computeDeltaColumniness: function(x0, y0, x1, y1) {
				var p, cLen, dCol = 0, cLen_1;
				cLen = 0;
				p = y0 > 0 && this.cells[x0 * this.fH + y0 - 1];
				while(p && p.x0 == x0 && p.x1 == x1) {
					cLen++;
					p = p.y0 > 0 && this.cells[x0 * this.fH + p.y0 - 1];
				}
				if(cLen) {
					cLen_1 = cLen - 1;
					dCol += cLen * cLen * cLen - cLen_1 * cLen_1 * cLen_1
				}

				cLen = 0;
				p = x0 > 0 && this.cells[(x0 - 1) * this.fH + y0];
				while(p && p.y0 == y0 && p.y1 == y1) {
					cLen++;
					p = p.x0 > 0 && this.cells[(p.x0 - 1) * this.fH + y0];
				}
				if(cLen) {
					cLen_1 = cLen - 1;
					dCol += cLen * cLen * cLen - cLen_1 * cLen_1 * cLen_1
				}
				return dCol;
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
				size: 8.0 //how much we care about getting relatvie sizes correct
				, crop: 2.0 //getting crop correct
				, preserve: 10.0 //preserving the position of things when re-laying-out
				, special: 20.0 //how much we care about special requests
				, columniness: 10.0 //how much do we penalize things forming rows and columns
				, bigFirst: 5.0 //how much do we prefer to place big things first
				
				, dampenAesthetics: 0.70  //how much attention we pay to aesthetics when searching for solutions, good aesthetics show up in the success factor

				, maxPositionError: 10000.0 //inflict severe penalty if we place something more than this many grid units from goal
				, maxPositionPenalty: 0.0

				, complexity: 3.0 //how hard do we try to keep the problem manageable
				, fail: 20.0 //how much do we avoid placements that previously failed to complete
				, success : 0.0 //how much do we count score of previous successes with a feature, this actually hurts right now :(
			};

			this.remainingRelativeSize = 0;
			this.remainingGridArea = field.fW * this.goalFieldHeight;
			this.ethings = {}; //proxy for things by id that has extra state attatched, commented below where we populate
			this.thingSizes = []; //tuples of thing and size ordered to optimize search stategy
			this.maxWidth = 0;
			this.nThingsPlaced = 0;
			this.nThings = this.things.length;

			this.featureCounts = new Array(1 << 20); //map of placement hashes to count of times a partial solution succeeses or failed when incorperating this placement

			this.solutionHash = 0;
			this.closedSolutions = {};
			this.solutions = []; //collection of solutions found thus far
			this.minScore = 0;
			this.maxScore = 0;
			this.avgScore = 0;
			this.iter0 = 0; //count of iterations thus far
			this.nRunThroughs = 0;
			this.nRepeatedSolutions = 0;

			function precompute() {
				var samplePlaces = [
					{x0: 0, y0: 0, x1: 1, y1: 1, w: 1, h: 1},
					{x0: this.field.fW - 1, y0: 0, x1: this.field.fW, y1: 1, w: 1, h: 1},
					{x0: 0, y0: this.goalFieldHeight - 1, x1: 1, y1: this.goalFieldHeight, w: 1, h: 1},
					{x0: this.field.fW - 1, y0: this.goalFieldHeight - 1, x1: this.field.fW, y1: this.goalFieldHeight, w: 1, h: 1}
				];

				_.each(things, function(thing) {
					this.remainingRelativeSize += thing.relativeSize;
				}, this);
				var totalThingSizesTrimmed = 0;
				_.each(things, function(thing) {
					
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

					var minSizeCost = 1e9, minCropCost = 1e9;
					var tssizes = _.map(thing.sizes, function(size) {
						this.maxWidth = Math.max(this.maxWidth, size.w, size.h);
						var rawSizeCost = this.priceSize(ething, size, samplePlaces[0]);
						var rawCropCost = this.priceCrop(ething, size, samplePlaces[0]);
						minSizeCost = Math.min(minSizeCost, rawSizeCost);
						minCropCost = Math.min(minCropCost, rawCropCost);
						return {
								ething: ething, size: size, 
								rawSizeCost: rawSizeCost, 
								rawCropCost: rawCropCost
						};
					}, this);
					_.each(tssizes, function(ts) {
						ts.sizeCost = ts.rawSizeCost - minSizeCost;
						ts.cropCost = ts.rawCropCost - minCropCost;
						ts.sizeAndCropCost = ts.sizeCost + ts.cropCost;
					}, this);
					var pc = tssizes.length;
					tssizes = _.sortBy(tssizes, 'sizeAndCropCost').slice(0, 20);
					totalThingSizesTrimmed += pc - tssizes.length;
					this.thingSizes.push.apply(this.thingSizes, tssizes);

					thing.sizes.sort(function(s1, s2) { return s2.h - s1.h; });
				}, this);

				_.chain(this.things).sortBy('relativeSize').each(function(thing, i) {
					this.ethings[thing.id].relativeSizeRank = this.nThings - i - 1;
				}, this);
				
				this.log('thingSizes.length=' + this.thingSizes.length + ', trimmed: ' + totalThingSizesTrimmed);

				//sort thing sizes in order of descending height
				this.thingSizes.sort(function(ts1, ts2) { return ts2.size.h - ts1.size.h; });


				this.sizes = _.chain(this.thingSizes)
						.groupBy(function(ts) { return ts.size.w + '-' + ts.size.h; })
						.map(function(tsg) {
							tsg = _.sortBy(tsg, 'sizeAndCropCost');
							return { w: tsg[0].size.w, h: tsg[0].size.h, thingSizes: tsg };
						}).value();

				//for each thing, calculate the total worst possible cost so that we 
				// can call that a gain when we place the thing, that way we are eager 
				// to make good placements instead of scornful of risky ones, otherwise
				// we'd never be able to get something in its special spot
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

					if(ething.sp) {
						ething.positionCostWeight = this.weights.special;
						ething.positionCostCx = ething.sp.x0 + ething.sp.w / 2;
						ething.positionCostCy = ething.sp.y0 + ething.sp.h / 2;
					} else if(ething.pp) {
						ething.positionCostWeight = this.weights.preserve;
						ething.positionCostCx = ething.pp.x0 + ething.pp.w / 2;
						ething.positionCostCy = ething.pp.y0 + ething.pp.h / 2;
					} else {
						ething.positionCostWeight = 0;
						ething.positionCostCx = 0;
						ething.positionCostCy = 0;
					}
					_.each(samplePlaces, function(place) {
						maxPositionCost = Math.max(maxPositionCost, this.pricePosition(ething, sampleSize, place) );
					}, this);
					ething.maxCost = maxCropCost + maxSizeCost + maxPositionCost;
				}, this);
			}
			precompute.call(this);
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
				if(ething.sp) {
					return this.weights.special * (sq(ething.sp.w - size.w) + sq(ething.sp.h - size.h));
				}
				// else if(ething.pp) {
				// 	return this.weights.preserve * (sq(ething.pp.w - size.w) + sq(ething.pp.h - size.h));
				// }
				else {
					var avgThingArea =  fieldArea / this.things.length
						, avgLength = Math.sqrt(avgThingArea)
						, nThingsRemaining = this.things.length - this.nThingsPlaced
						, avgRelativeSize = this.remainingRelativeSize / nThingsRemaining
						, goalLength = thing.relativeSize * avgLength / avgRelativeSize
						;
					return this.weights.size * sq(goalLength - Math.min(size.w, size.h));
				}
			},
			pricePosition: function(ething, size, place) {
				var cx = place.x0 + size.w / 2
					, cy = place.y0 + size.h / 2
					, sq = this.sq
					;
				if(ething.sp) {
					var scx = ething.sp.x0 + ething.sp.w / 2
						, scy = ething.sp.y0 + ething.sp.h / 2
						;
					return this.weights.special * ( (scx - cx) * (scx - cx) + (scy - cy) * (scy - cy) );
				} else if(ething.pp) {
					var pcx = ething.pp.x0 + ething.pp.w / 2
						, pcy = ething.pp.y0 + ething.pp.h / 2
						;
					return this.weights.preserve * ( (pcx - cx) * (pcx - cx) + (pcy - cy) * (pcy - cy) );
				} else {
					return 0;
				}
			},
			scorePlacement: function(ething, size, place, thingSize, protoPlacement) {
				var costs = {crop: 0, size: 0, position: 0, complexity: 0, fail: 0, success: 0, columniness: 0, totalCost: 0, worseCase: 0, score: 0}
					, cost = 0
					, x0 = place.x0, y0 = place.y0, w = size.w, h = size.h
					;
				cost += costs.crop = thingSize.cropCost;
				cost += costs.size = thingSize.sizeCost;

				var dx = x0 + w / 2 - ething.positionCostCx
					, dy = y0 + h / 2 - ething.positionCostCy
					, posErr2 =dx * dx + dy * dy
					, maxD2 = this.weights.maxPositionError * this.weights.maxPositionError
					;
				cost += costs.position = ething.positionCostWeight ? 
						(ething.positionCostWeight * posErr2 + (posErr2 > maxD2 ? this.weights.maxPositionPenalty : 0)) : 0;
				
				cost += costs.columniness = this.weights.columniness * this.field.computeDeltaColumniness(x0, y0, x0 + w, y0 + h);
				
				var dOrder = ething.relativeSizeRank - this.nThingsPlaced;
				cost += costs.relativeSizeRank = this.weights.bigFirst * dOrder * (1 + Math.abs(dOrder));

				cost *= this.weights.dampenAesthetics;

				cost += costs.complexity = this.weights.complexity * this.field.computeComplexityOfPlacement(x0, y0, x0 + w, y0 + h);
				
				var pfcost = 0, sscost = 0;
				var hashes = [protoPlacement.hash];
				//this.field.getAdjacentFeatures(x0, y0, w, h, hashes);
				protoPlacement.featureHashes = hashes;
				var priorFaiure = (this.nRunThroughs - this.solutions.length + 0.5) / (0.5 + this.solutions.length);
				var successWeight = 0;
				for(var i = hashes.length - 1; i >= 0; i--) {
					var feat = this.featureCounts[0x000fffff & hashes[i]];
					if(!feat) {
						continue;
					}
					var p = feat.successCount, f = feat.failureCount, n = p + f;
					pfcost += f > p && ((f + 0.5) / (0.5 + p));
					sscost += feat.successCount * (feat.score - this.maxScore);
					successWeight += feat.successCount;
				}
				var nFeats = Math.max(1, hashes.length);
				cost += costs.fail = this.weights.fail * pfcost / nFeats;
				cost += costs.success = -this.weights.success * sscost / Math.max(1, successWeight);
				if(costs.success < 0) throw new Error('Impossible');
//				protoPlacement.featureHashes = [];
				// costs.fail = 0;
//				costs.success = 0;

				if(isNaN(cost)) {
					throw new Error('Numerical error');
				}
				costs.totalCost = cost;
				costs.worseCase = ething.maxCost;
				//costs.score = ething.maxCost - cost;
				costs.score = 0 - cost;
				return costs;
			},
			findProtoPlacements: function(place) {
				var protoPlacements = [];
				for(var tsi = 0, tsn = this.thingSizes.length; tsi < tsn; tsi++) {
					var thingSize = this.thingSizes[tsi]
						, ething = thingSize.ething
						, thing = ething.thing
						, size = thingSize.size
						;
					if(!ething.placed && size.h <= place.h && size.w <= place.w) {
						var pHash = 0x3fffffff & (thing.id * 2179 + this.field.hashPlacement(place.x0, place.y0, size.w, size.h));
						protoPlacements.push({ething: ething, thing: thing, size: size, place: place, thingSize: thingSize, hash: pHash,
												featureHashes: null, costs: null, score: 0, p: 0});
					
					}
				}
				return protoPlacements;
			},
			costToPBase: Math.pow(2.0, 1.0 / 1.0), //every 1 points of score is a factor of two in liklihood of placement 
			scoreProtoPlacements: function(protoPlacements) {
				var totP = 0.0, ppi, pp, r, ppn = protoPlacements.length, maxScore = -1e50;
				for(ppi = 0; ppi < ppn; ppi++) {
					pp = protoPlacements[ppi];
					pp.costs = this.scorePlacement(pp.ething, pp.size, pp.place, pp.thingSize, pp);
					pp.score = pp.costs.score;
					maxScore = Math.max(maxScore, pp.score);
				}
				var minP = 1e-12, minScore = Math.max(-10000, Math.log(minP) / Math.log(this.costToPBase) + maxScore);
				var scaleScore = Math.log(this.costToPBase);
				var ppj = 0;
				for(ppi = 0; ppi < ppn; ppi++) {
					var pp = protoPlacements[ppi];
					if(pp.score >= minScore) {
						totP += pp.p = Math.exp(scaleScore * (pp.score - maxScore));
						protoPlacements[ppj++] = pp;
					}
				}
				protoPlacements.length = ppj;
				if(isNaN(totP))
					throw new Error('totP is NaN!');
				return totP;
			},
			finishRunThrough: function(success) {
				"Current partial solution doesn't work, or it did, learn from it. Clear the field."
				
				var score = 0, closed = false;
				if(success) {
					closed = this.closedSolutions[ this.solutionHash ];
					if(closed) {
						this.nRepeatedSolutions++;
					} else {
						this.closedSolutions[ this.field.hash ] = true;
						
						//This gives the average score of each thing
						var sizeCost = 0, cropCost = 0, positionCost = 0, columninessCost = 0, bigFirstCost = 0, worstTotalCost = 0;
						for(var i = this.things.length - 1; i >= 0; i--) {
							var ething = this.ethings[this.things[i].id];
							var costs = ething.protoPlacement.costs;
							sizeCost += costs.size;
							cropCost += costs.crop;
							positionCost += costs.position;
							columninessCost += costs.columniness;
							bigFirstCost += costs.relativeSizeRank;
							worstTotalCost = Math.max(worstTotalCost, costs.totalCost);
						}
						score = (0 - sizeCost - cropCost - positionCost - columninessCost - bigFirstCost) / Math.max(1, this.nThingsPlaced);
						
						this.minScore = Math.min(this.minScore, score);
						this.maxScore = Math.max(this.maxScore, score);
						var k = this.solutions.length;
						this.avgScore = (k * this.avgScore + score) / (k + 1);
						var pj = this.solutions.length - 1
							, pSol = pj >= 0 && this.solutions[pj]
							, pIter = pSol ? pSol.info.iterations : 0
							, pt = pSol ? pSol.info.t : 0
							, pRunThroughs = pSol ? pSol.info.nRunThroughs : 0
							, t = new Date().getTime() - this.startedPacking
							;
						this.solutions.push({
							placements: this.getPlacements(),
							score: score, 
							hash: this.solutionHash,
							info: {
								score: score, 
								hash: this.solutionHash,
								iterations: this.iter0,
								t: t,
								nRunThroughs: this.nRunThroughs,
								sizeCost: sizeCost,
								cropCost: cropCost,
								positionCost: positionCost,
								columninessCost: columninessCost,
								dIterations: this.iter0 - pIter,
								dt: t - pt,
								iterPerMS: (this.iter0 - pIter) / (t - pt),
								dRunThroughs: this.nRunThroughs - pRunThroughs,
								worstTotalCost: worstTotalCost
							}
						});
					}
				}

				var uncoveredPlacements = this.field.getUncoveredPlacements();
				var allPlacements = this.field.getAllPlacements();
				for(var thingId in allPlacements) {
					var placement = allPlacements[thingId];
					var ething = this.ethings[thingId];
					if(!closed) {
						var hashes = ething.protoPlacement.featureHashes;
						for(var i = hashes.length - 1; i >= 0; i--) {
							var j = 0x000fffff & hashes[i];
							var feat = this.featureCounts[j] || 
											( this.featureCounts[j] = {
												successCount: 0, failureCount: 0, score: 0,
												x0: placement.x0, y0: placement.y0, w: placement.w, h: placement.h } );
							if(closed) {
								//noop, just don't train again
							} else if(success) {
								var sc = feat.successCount, sc1 = sc + 1;
								feat.score = (sc * feat.score + score) / sc1;
								feat.successCount = sc1;
							} else if(thingId in uncoveredPlacements) {
								feat.failureCount++;
							}
						}
					}
					ething.placed = false;
					ething.placement = null;
					ething.protoPlacement = null;					
				}
				this.nThingsPlaced = 0;
				this.solutionHash = 0;
				this.field.clear();
				this.nRunThroughs++;
			},
			iterate: function() {
				"Will either place one thing or remove a few things"
				var place = this.field.findPlace()
					, protoPlacements = this.findProtoPlacements(place)
					;
				if(protoPlacements.length == 0) {
					return this.finishRunThrough(false);
				}
				var totP = this.scoreProtoPlacements(protoPlacements) //will splice some protoPlacements out of array because they were too improbable
					, ppn = protoPlacements.length
					;
				if(ppn == 0) {
					return this.finishRunThrough(false);
				}
				var ppi, pp, r;
				
				do {
					r = Math.random() * totP;
					for(ppi = 0; ppi < ppn; ppi++) {
						pp = protoPlacements[ppi];
						r -= pp.p;
						if(r < 0.0)
							break;
					}
				} while(ppi >= ppn); //loop in case floating point screwed us up

				var placement = this.field.place(pp.thing, pp.size, pp.place);
				pp.ething.placed = true;
				pp.ething.placement = placement;
				placement.protoPlacement = pp;
				pp.ething.protoPlacement = pp;
				this.solutionHash += pp.hash;
				this.nThingsPlaced++;
				if(this.nThingsPlaced == this.nThings) {
					this.finishRunThrough(true);
				}
			},

			pack: function(maxIterations, minIterations, maxTime, maxSolutions, cb) {
				minIterations = minIterations || 0;
				var t0 = new Date().getTime()
					, lastStat = t0
					;
				this.startedPacking = t0;
				this.packingReport = {};
				this.log('started packing');
				this.iter0 = 1
				function loop() {

					for(var batchi = 1, batchn = Math.min(1000, maxIterations - this.iter0); batchi <= batchn; batchi++, this.iter0++) {
						var pns = this.solutions.length;
						this.iterate();
						var foundOne =  this.solutions.length > pns;
						if(foundOne || this.iter0 % 1000 == 0) {
							var t1 = new Date().getTime();
							if(foundOne || t1 - lastStat > 500) {
								lastStat = t1;
								this.log('packing iteration: ' + this.iter0 + 
										', nRunThroughs: ' + this.nRunThroughs + 
										', nSolutions: ' + this.solutions.length + 
										', nRepeatedSolutions: ' + this.nRepeatedSolutions + 
										', best score: ' + _.max(_.pluck(this.solutions, 'score')) +
										', minScore: ' + this.minScore +
										', avgScore: ' + this.avgScore +
									'');
							}
							if(this.iter0 > minIterations && maxTime && t1 - t0 > maxTime) {
								this.log('packing timeout');
								return cb(this.solutions.length);
							}
							if(this.iter0 > minIterations && maxSolutions && this.solutions.length >= maxSolutions) {
								this.log('packing max solutions reached');
								return cb(this.solutions.length);
							}
						}
					}
					if(this.iter0 >= maxIterations) {
						this.log('packing max iterations reached');
						return cb(this.solutions.length);
					}
					setTimeout(loopm, 1);
				}
				var self = this, loopm = function() { loop.call(self); };
				setTimeout(loopm, 1);
			},
			getPlacements: function() {
				"returns dictionary of placements by thing id"
				var placements = {};
				for(var i = this.things.length - 1; i >= 0; i--) {
					var thingId = this.things[i].id;
					placements[thingId] = this.ethings[thingId].placement;
				}
				return placements;
			},
			getBestSolution: function() {
				var p = null, s = -1e50, besti = -1;
				for(var i = this.solutions.length - 1; i >= 0; i--) {
					if(this.solutions[i].score > s) {
						besti = i;
						s = this.solutions[i].score;
						p = this.solutions[i].placements;
					}
				}
				this.log('choosing solution ' + besti);
				return p;
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
		setField: function($field) {
			if(this.$field) {
				if(this.$field.data(this.cssPrefix + this.dataLayoutRoot) == this) {
					this.$field.removeData(this.cssPrefix + this.dataLayoutRoot);
				}
			}
			this.$field = $field;
			if($field) {
				$field.data(this.cssPrefix + this.dataLayoutRoot, this);
			}
		},
		getViewportHeight: function() {
			return $(window).height();
		},
		fetchNativeSize: function(src, cb) {
			var cb2 = _.once(cb);
			var $img = $(document.createElement('img')).addClass(this.cssPrefix + 'cacheimg').appendTo(this.getSandbox());
			$img
				.load(function() {
					var w = $img.width(), h = $img.height();
					$img.remove();
					cb2(w, h);
				})
				.attr('src', src);
			setTimeout(cb2, 5000);
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
					
					var ecs = [-offsetTop / s, (scaledWidth - width + offsetLeft) / s, 
											(scaledHeight - height + offsetTop) / s, -offsetLeft / s]
						, cropErrors = _.map(ecs, function(effCrop, i) { return this.gridLengthCeil(Math.abs(effCrop - crops[i])); }, this)
						;
					//how many grid units are we off from the intended crop if we scaled up to native size
					cost = 	cropErrors[0] * w + cropErrors[0] * cropErrors[1] + 
							cropErrors[1] * h + cropErrors[1] * cropErrors[2] + 
							cropErrors[2] * w + cropErrors[2] * cropErrors[3] + 
							cropErrors[3] * h + cropErrors[3] * cropErrors[0]; 

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
		findThings: function() {
			var $field = this.$field
				, things = []
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
				$thing.attr('data-' + self.cssPrefix + '-thing-id', thing.id);
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

			var t0 = new Date().getTime(), self = this;
			function check() {
				var t1 = new Date().getTime();
				if(_.every(things, function(thing) { return thing.ready; })) {
					return cb.call(self, true);
				} else if( t1 > t0 + timeout) {
					return cb.call(self, false);
				} else {
					setTimeout(check, Math.min(100, t0 + timeout - t1));
				}
			}
			check();
		},
		packRectangles: function(things, fieldWidth, goalFieldHeight, cb) {
			var field = new Layout.Field(fieldWidth, Math.floor(1.5 * goalFieldHeight + this.maxLength))
				, packing = new Layout.Packing(field, things, goalFieldHeight)
				, maxIterPerItem = 1000
				, self = this
				;
			this.field = field;
			this.packing = packing;
			!!packing.pack(100 * 1000 /* max iterations */, 
										500 /* min iterations */, 
										10 * 1000 /* timeout ms */,
										15 /* max solutions to generate */,
					function(nSolutions) {
						if(!nSolutions) {
							throw new Error('Packing failure');
						}
						cb.call(self, packing.getBestSolution());	
					}
			);
		},
		positionRectangles: function(things, placements) {
			var stepsize = this.padding + this.gridSize, maxHeight = 0;
			
			var tweenInterval = 30, minTweenDelay = 5, log = this.log;
			function tween(duration, waypoints, f) {
				if(typeof duration != 'number' || isNaN(duration) || duration < 0) {
					throw new Error('First argument to tween() must be the non-negative number of microseconds to tween for.');
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
						//log('Tweening last frame of ' + frames + ' in ' + duration + 'ms, last frame took ' + tac + 'ms');
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
					, placement = placements[thing.id]
					;
				if(!placement) {
					thing.$el.removeClass(this.cssPrefix + this.cssLayoutDone);
					return;
				}
				var left = stepsize * placement.x0
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
			if(currentFieldWidth < 10) {
				_.each(things, function(thing) { thing.placement = null; });
				return;
			}
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
		layout: function(cb) {
			if(!this.$field) {
				throw new Error('No layout field');
			}
			$field = this.$field;
			var width = $field.width()
				, _height = $field.height()
				, height = _height >= this.pixelLength(this.minLength) ? _height : $(window).height()
				, fieldWidth = this.gridLengthFloor(width)
				, things = this.findThings($field)
				, self = this
				;
			$field.addClass(this.cssPrefix + this.cssBusy);
			$field.addClass(this.cssPrefix + this.cssWaitingForContent);
			
			this.waitForThingsToBeReady(things, 30000, function() {
				var nThings = things.length
					, goalFieldHeight = self.estimateGridHeight(nThings, width, height)
					;	
				$field.removeClass(this.cssPrefix + this.cssWaitingForContent);
				$field.addClass(this.cssPrefix + this.cssComputing);
				
				if(self.fieldWidth && self.fieldWidth != fieldWidth) {
					self.scalePreviousPlacements(things, this.fieldWidth, fieldWidth);
				}

				self.packRectangles(things, fieldWidth, goalFieldHeight, function(placements){
					$field.removeClass(this.cssPrefix + this.cssComputing);
					$field.removeClass(this.cssPrefix + this.cssBusy);
				
					_.each(things, function(thing) {
						thing.placement = placements[thing.id];
					});
					self.fieldWidth = fieldWidth;
					self.positionRectangles(things, placements);
					cb.call(this);
				});
			});
		},
		estimateGridHeight: function(nThings, width, height) {
			//we want to average an area of at least 8 grid units per thing
			var w = this.gridLengthFloor(width), minH = this.gridLengthFloor(height)
				, avgLen = Math.min(w, Math.max( this.minLength * 1.5,  w / 6) )
				, avgThingArea = avgLen * avgLen
				, h = Math.max(minH, Math.ceil(nThings * avgThingArea / w))
				;
			return h;
		},
		enableResizeHandler: function() {
			if(this.resizeHandlerEnabled) {
				return;
			}
			this.resizeHandlerEnabled = true;
			var inlow0 = this.$field.width() //inout loop width state
				, outlow0 = inlow0 //output loop width state
				, gw = inlow0 //intra loop communication of intended width
				, t0 = 0 //when input loop width last changed
				, resizing = false //are we currently calculating a resize in the output loop
				, inloto = null //input loop timeout
				, delay = 300 //how long must window size be still before we trigger event?
				, self = this
				, outputLoop = _.bind(outputLoopf, this)
				, inputLoop = _.bind(inputLoopf, this)
				;
			function outputLoopf() {
				if(!resizing && outlow0 != gw) {
					outlow0 = gw;
					resizing = true;
					console.log('calling planePack on resize');
					this.layout(function() {
						resizing = false;
						console.log('finished planePack on resize!');
						setTimeout(outputLoop, 1);
					});
				}
			}

			function inputLoopf() {
				if(inloto) {
					clearTimeout(inloto);
					inloto = null;
				}
				if(!this.$field || !this.$field.closest('body').length || this.$field.data(this.cssPrefix + this.dataLayoutRoot) != this) {
					$(window).off('resize', inputLoop);
					this.resizeHandlerEnabled = false;
					return;
				}
				var ww1 = this.$field.width(), t1 = new Date().getTime();
				if(t0 > 0 && inlow0 == ww1) {
					if(t1 - t0 >= delay) {
						gw = inlow0;
						outputLoop();
					} else {
						setTimeout(inputLoop, delay - (t1 - t0))
					}
				} else if(inlow0 != ww1) {
					t0 = t1;
					inlow0 = ww1;
					setTimeout(inputLoop, delay);
				}
			}

			$(window).resize(inputLoop);
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
			}
			var self = this;
			layout.layout(function() {
				if(opt.resizable !== false) {
					layout.enableResizeHandler()
				}
				cb && cb.call(self, this);
			});
		}
	})
	return Layout;
});




