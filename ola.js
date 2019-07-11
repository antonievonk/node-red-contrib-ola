module.exports = function(RED) {
    var http = require('http');
    var querystring = require('querystring');

    function OLANode(config) {
        RED.nodes.createNode(this, config);

        this.host = config.host || "127.0.0.1";
        this.port = config.port || 9090;
        this.universe = config.universe || 1;
        this.size = config.size || 512;

        // initiate the dmx data array
        this.addresses = [];
        this.timers = [];
        this.intervals = [];

        for (var i = 0; i < this.size; i++){
            this.addresses[i] = 0;
            this.timers[i] = null;
            this.intervals[i] = null;
        }

        var node = this;


        this.on('input', function(msg) {

            if (msg.payload.transition == 'change' || msg.payload.transition == null) {
                if (msg.payload.channel) {
                    node.addresses[msg.payload.channel - 1] = msg.payload.value;
                } else if (msg.payload.channels) {
                    msg.payload.channels.forEach(function(channel) {
                        node.addresses[channel.channel - 1] = channel.value;
                    });
                }

                sendDMX(node.addresses);

            } else if (msg.payload.transition == 'fade') {

                if (msg.payload.channel) { // single channel fade
                    fadeToValue(msg.payload.channel, msg.payload.value, msg.payload.time);
                } else if (msg.payload.channels) {
                    i = 0;
                    msg.payload.channels.forEach(function(channel) {
                        fadeToValue(channel.channel, channel.value, msg.payload.time);
                    });
                }
            }

        });

        function sendDMX(values) {
            var DMXvalues = []
            for (var i = 0; i < values.length; i++) DMXvalues[i] = Math.round(values[i]);

            var post_data = querystring.stringify({
                u: node.universe,
                d: DMXvalues.join(',')
            });

            var post_options = {
                host: node.host,
                port: node.port,
                path: '/set_dmx',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Content-Length': Buffer.byteLength(post_data)
                }
            };

            var post_req = http.request(post_options);

            post_req.on('error', function(e) {
                this.error("Error performing request to OLA: " + e.message);
            });


            post_req.write(post_data);
            post_req.end();
        }

        function fadeToValue(channel, new_value, transition_time) {
            var old_values = node.addresses;

            var steps = parseInt(transition_time / 25);

            // clear previous timers
            if (node.intervals[channel - 1] != null){
                clearInterval(node.intervals[channel - 1]);
            }
            if (node.timers[channel - 1] != null){
                clearTimeout(node.timers[channel - 1]);
            }


            // calculate difference between new and old values
            diff = Math.abs(old_values[channel - 1] -  new_value);


            // should we fade up or down?
            if (new_value > old_values[channel - 1]) {
                var step_value =  diff / steps;
            } else {
                var step_value =  (diff / steps) * -1;
            }

            var time_per_step = transition_time / steps;

            // create time outs for each step
            node.intervals[channel -1 ] = setInterval(function() {
                node.addresses[channel - 1] +=  step_value;
                sendDMX(node.addresses);
            }, time_per_step);

            node.timers[channel-1] = setTimeout(function() {
                clearInterval(node.intervals[channel - 1]);
                node.intervals[channel - 1] = null;
                node.addresses[channel - 1] = new_value;
                sendDMX(node.addresses);
                node.timers[channel - 1] = null;
            }, transition_time);
        }
    }
    RED.nodes.registerType("ola", OLANode);
};
