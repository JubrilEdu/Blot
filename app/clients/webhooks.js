const config = require("config");
const redis = require("redis");
const client = require("client");
const express = require("express");
const CHANNEL = "webhook-forwarder";
const EventSource = require("eventsource");
const fetch = require("node-fetch");
const clfdate = require("helper/clfdate");
const querystring = require("querystring");
const bodyParser = require("body-parser");

const PRODUCTION_HOST = "blot.im";
const DEVELOPMENT_HOST = "blot.development";

// This app is run on Blot's server in production
// and relays webhooks to any connected local clients
// Should this be authenticated in some way?
const app = express();

app.get("/connect", function (req, res) {
  const client = redis.createClient();

  req.socket.setTimeout(2147483647);
  res.writeHead(200, {
    "X-Accel-Buffering": "no",
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
  });

  res.write("\n");

  client.subscribe(CHANNEL);

  client.on("message", function (_channel, message) {
    if (_channel !== CHANNEL) return;
    res.write("\n");
    res.write("data: " + message + "\n\n");
    res.flushHeaders();
  });

  client.on("error", function (err) {
    console.error(err);
    res.socket.destroy();
  });

  req.on("close", function () {
    client.unsubscribe();
    client.quit();
  });
});

app.get("/clients/google-drive/authenticate", (req, res) => {
  const url =
    config.protocol +
    DEVELOPMENT_HOST +
    "/clients/google-drive/authenticate?" +
    querystring.stringify(req.query);
  res.redirect(url);
});

// This is sent by Dropbox to verify a webhook when first added
app.get("/clients/dropbox/webhook", (req, res, next) => {
  if (!req.query || !req.query.challenge) return next();
  res.send(req.query.challenge);
});

app.use(
  bodyParser.raw({
    inflate: true,
    limit: "100kb",
    type: "application/*",
  }),
  (req, res) => {
    res.send("OK");

    const headers = req.headers;

    // These headers trigger a redirect loop?
    // host: 'webhooks.blot.development',
    // 'x-real-ip': '127.0.0.1',
    // 'x-forwarded-for': '127.0.0.1',
    // 'x-forwarded-proto': 'https',
    delete headers.host;
    delete headers["x-real-ip"];
    delete headers["x-forwarded-for"];
    delete headers["x-forwarded-proto"];

    const message = {
      url: req.url,
      headers,
      method: req.method,
      body: req.body ? req.body.toString() : "",
    };

    console.log(clfdate(), "Webhooks publishing webhook", req.url);
    client.publish(CHANNEL, JSON.stringify(message));
  }
);

function listenForWebhooks(REMOTE_HOST) {
  // when testing this, replace REMOTE_HOST with 'webhooks.blot.development'
  // and use the following config for node-fetch
  // and then pass this:
  // and pass this as second argument to new EventSource();
  // { https: { rejectUnauthorized: false } }
  const url = "https://" + REMOTE_HOST + "/connect";
  const stream = new EventSource(url);

  console.log(clfdate(), "Webhooks subscribing to", url);

  stream.onopen = function () {
    console.log(clfdate(), "Webhooks subscribed to", url);
  };

  stream.onerror = function (err) {
    console.log(clfdate(), "Webhooks error with remote server:", err);
  };

  stream.onmessage = async function ({ data }) {
    const { method, body, url, headers } = JSON.parse(data);

    console.log(clfdate(), "Webhooks requesting", url);

    try {
      const request = require("request");
      request(
        {
          uri: "https://" + config.host + url,
          headers: headers,
          method,
          body,
        },
        function (err, res, body) {
          console.log(err);
          // console.log(res);
          // console.log(body);
        }
      );
    } catch (e) {
      console.log(e);
    }
  };
}

if (config.environment === "development")
  listenForWebhooks("webhooks." + PRODUCTION_HOST);

module.exports = app;
