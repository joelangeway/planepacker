#planepacker.js

planepacker.js is a rectangle packing layout engine. Its goal is to layout a set of images such that their relative sizes and their crops are optimal, while being visually appealing and not falling into boring rows or columns. Additionally, it should be able to adjust a layout without totally randomizing it. 

It nearly accomplishes these goals. You can see a demo (here)[http://joelangeway.github.io/planepacker/demo.html].

You can use it. The license is the MIT license.

Documentation and tests will come some time soon after it is ready for use by others.

##What it does

planepacker.js is a JQuery plugin. When called on an element, it finds all the children of that element that it knows how to layout, and it resizes and moves them into a tetris type configuration on a grid, leaving no empty space except at the bottom. 

The grid is made of identical squares. There is a constant global padding distance which is the distance between adjacent grid squares. Each layed out element will completely contain one grid square at the extremes of each of its corners. Call *gridSize* the side length of a grid square and *padding* the distamce between neighboring grid squares, then the length of a side of a layed out element in pixels is

    gridSize * n + padding * (n - 1)

where *n* is the length in grid squares or grid units. Each element will be at least two grid units long in each dimension. 

Currently, the only type of thing that planepacker.js supports laying out are images. It automatically crops and scales them.

Each element can specify it's relative size and planepacker.js will attempt to convey these relative sizes. The relative orderings of the elements are not preserved; this may change. On resize, the relative positions of the elements are intended to be preserved.

##How it works

It works by Markov Chain Monte Carlo. Each iteration, it places one element at the top most left most free space. It chooses which item to place and at what size by randomly selecting from all of the possibilities, weighting their likelihoods by how well placements with similar features have worked out in the past, where the past means all the iterations since we first started laying out this collection. It finds many solutions and picks the best one based on matching relative sizes, previous positions, minmizing crops, and maximizing geometric entropy.
