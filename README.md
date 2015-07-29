# js-csp_demo
Demonstration project for js-csp

It is a very crude example of a network monitoring screen, designed to show how CSP can simplify code in a
moderately complex situation.

This code is designed to run in the browser. For it to work, you need to 'browserify' it.

Clone the repo, then use npm install.

If you don't have browserify, install it with
npm install -g browserify

Then you can transpile the code using 'browserify element.js -o channels.js'

Each time you click on a box on the screen, you create an 'error' in the network element. Five or more errors in
5 seconds causes a major alarm. The network element will then 'reboot' itself. The background colors in the element group
show the urgency of taking action to resolve the problem.