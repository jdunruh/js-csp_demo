
var csp = require('js-csp');
var $ = require('jquery');

// set the alarm status class on the element
var setStatus = function(element,status) {
    $(element).removeClass('minorAlarm majorAlarm noAlarm').addClass(status);
};

// element is the selector for this network element
var networkElement = function(errorChan, northBound, element) {
    var errors = 0;
    csp.go(function*() {
        while (true) {
            var timeout = csp.timeout(5000); // timeout in 5 seconds
            var result = yield csp.alts([errorChan, timeout]);
            if (result.channel === timeout) {
                var status = (errors >= 5) ? 'majorAlarm' : 'noAlarm';
                errors = 0;
                setStatus(element, status);
                yield csp.put(northBound, {element: element, status: status}); // send out of service indicator to the northbound interface
            } else { // input was from errorChan, which is an error indication
                if(++errors === 5) {
                    setStatus(element, 'majorAlarm');
                    yield csp.put(northBound,{element: element, status: 'majorAlarm'});
                }
            }
        }
    });
};


// set up alarm status on composite elements - groups of other elements
var setGroupAlarm = function(element, numAlarms, majorThreshold, minorThreshold) {
    var status = 'noAlarm';
    if(numAlarms >= majorThreshold) {
        status = 'majorAlarm'
    } else if(numAlarms >= minorThreshold) {
        status = 'minorAlarm';
    } else
      status =  'noAlarm';
    setStatus(element, status);
    console.log("set status of " + element + " to " + status);
    return {element: element, status: status};
};

// subTendingElements is an array of the selector strings for the subtending network elements on the page
// groupSelecton is the selector for this group in the page
var elementGroup = function (northBound, southBound, subTendingElements, minorThreshold, majorThreshold, groupSelector, timer) {
    csp.go(function*() {
        var numMajor = 0;
        var elements = {}; // keep track of each subtending element
        // use object as a hash to track reporting by subtending elements
        subTendingElements.forEach(function (el) {
            elements[el] = {status: "noAlarm", updated: true};
        });
        var timeout = csp.timeout(timer);

        while(true) {
            var result = yield csp.alts([southBound, timeout]);
            if(result.channel === timeout) {
                // on timeout, update status to saved value and set saved value to majorAlarm so that it will come up as
                // a major alarm if an element doesn't check in each minute, indicating the problem
                for (var i in elements) {
                    if (elements.hasOwnProperty(i)) {
                        if (elements[i].updated === false && elements[i].status != 'majorAlarm') {
                            elements[i].status = 'majorAlarm';
                            ++numMajor;
                        }
                        elements[i].updated = false;
                    }
                }
                // update status and send status to northBound so we don't time out
                console.log("finished timeout in " + groupSelector);
               yield csp.put(northBound, setGroupAlarm(groupSelector, numMajor, majorThreshold, minorThreshold));
                timeout = csp.timeout(timer);
            } else { // not a timeout
                console.log(result.value.element + "reported in with status " + result.value.status);
                if (result.value.status === 'majorAlarm') {
                    if (elements[result.value.element].status != 'majorAlarm')
                        yield csp.put(northBound, setGroupAlarm(groupSelector, ++numMajor, majorThreshold, minorThreshold));
                } else {
                    if (elements[result.value.element].status === 'majorAlarm')
                        yield csp.put(northBound, setGroupAlarm(groupSelector, --numMajor, majorThreshold, minorThreshold));
                }
                elements[result.value.element].status = result.value.status;
                elements[result.value.element].updated = true;
            }
        }
    })
};


// wire up the dataflow

// create the channels
var webServerNorthbound = csp.chan();
var loadBalancerNorthbound = csp.chan();
var databaseServerNorthbound = csp.chan();
var groupNorthbound = csp.chan();

// wire the network elements
var setNetworkElementHandlers = function(selector, northBound) {
    $(selector).each(function(index, el) {
        var ch = csp.chan();
        networkElement(ch, northBound, '#' + el.getAttribute('id'));
        $(el).click(function () {
            csp.putAsync(ch, 'Error');
        });
    });
};

setNetworkElementHandlers('.loadBalancer', loadBalancerNorthbound);
setNetworkElementHandlers('.webServer', webServerNorthbound);
setNetworkElementHandlers('.databaseServer', databaseServerNorthbound);

// for the container, the NB goes into the bit bucket, so use a dropping buffer
var containerNorthbound = csp.chan(csp.buffers.dropping(1));

// wire the groups
elementGroup(groupNorthbound, loadBalancerNorthbound, ['#LB1'], 1, 1, '#loadBalancers', 6000);
elementGroup(groupNorthbound, webServerNorthbound, ['#WS1', '#WS2', '#WS3', '#WS4'], 1, 2, '#webServers', 7000);
elementGroup(groupNorthbound, databaseServerNorthbound, ['#DS1', '#DS2'], 1, 1, "#databaseServers", 8000);

// wire the container
elementGroup(containerNorthbound, groupNorthbound, ['#loadBalancers', '#webServers', '#databaseServers'], 1, 1, '#container', 9000);


