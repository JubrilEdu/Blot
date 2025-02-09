const mustache = require("mustache");
const config = require("config");
const fs = require("fs-extra");

const NODE_SERVER_IP = process.env.NODE_SERVER_IP;
const REDIS_IP = process.env.REDIS_IP;

const OUTPUT = __dirname + "/data";
const CONFIG_DIRECTORY = __dirname + "/conf";

const template = fs.readFileSync(`${CONFIG_DIRECTORY}/server.conf`, "utf8");
const partials = {};

// remote config directory
const config_directory =
  process.env.OPENRESTY_CONFIG_DIRECTORY || "/home/ec2-user/openresty";

const locals = {
  blot_directory: config.blot_directory,
  // development: config.environment === "development",
  host: "blot.im",
  disable_http2: process.env.DISABLE_HTTP2,
  node_ip: NODE_SERVER_IP,
  node_port: config.port,
  lua_package_path: process.env.LUA_PACKAGE_PATH,
  redis: { host: REDIS_IP },
  reverse_proxy_ip: process.env.PUBLIC_IP,
  server_label: !process.env.PUBLIC_IP
    ? ""
    : process.env.PUBLIC_IP.startsWith("18.")
    ? "eu"
    : "us",
  user: process.env.OPENRESTY_USER || "ec2-user",
  log_directory: process.env.OPENRESTY_LOG_DIRECTORY || config_directory,
  config_directory,
  // if you change the cache directory, you must also update the
  // script mount-instance-store.sh
  cache_directory: process.env.OPENRESTY_CACHE_DIRECTORY || "/var/www/cache",
  ssl_certificate:
    process.env.SSL_CERTIFICATE || "/etc/ssl/private/letsencrypt-domain.pem",
  ssl_certificate_key:
    process.env.SSL_CERTIFICATE_KEY || "/etc/ssl/private/letsencrypt-domain.key"
};

if (!NODE_SERVER_IP) throw new Error("NODE_SERVER_IP not set");
if (!REDIS_IP) throw new Error("REDIS_IP not set");

fs.emptyDirSync(OUTPUT);

fs.copySync(`${__dirname}/html`, `${__dirname}/data/html`);

fs.readdirSync(CONFIG_DIRECTORY).forEach(file => {
  // copy lua files to data directory so they are available to nginx
  if (file.endsWith(".lua")) {
    fs.copySync(CONFIG_DIRECTORY + "/" + file, OUTPUT + "/" + file);
  }

  if (!file.endsWith(".conf")) return;

  partials[file] = fs.readFileSync(CONFIG_DIRECTORY + "/" + file, "utf8");
});

const warning = `

# !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
# !!!!!!!!!!!   WARNING                                   !!!!!!!!!!!
# !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

# Do not edit this file directly

# This file was generated by ../build.js
# Please update the source files in ./conf and run ../build.js

# !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
# !!!!!!!!!!!   WARNING                                   !!!!!!!!!!!
# !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

`;

const result = mustache.render(template, locals, partials);

fs.outputFileSync(__dirname + "/data/openresty.conf", warning + result);
