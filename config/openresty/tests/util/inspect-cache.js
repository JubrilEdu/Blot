const fetch = require("node-fetch");
const fs = require("fs-extra");

const main = async (
  origin = "http://127.0.0.1/inspect",
  cache_directory = "/var/www/cache"
) => {
  const top_level_directories = await fs.readdir(cache_directory);
  const cache = {};

  // for each top level directory, read its contents
  for (const directory of top_level_directories) {
    const sub_directories = await fs.readdir(`${cache_directory}/${directory}`);
    for (const sub_directory of sub_directories) {
      const files = await fs.readdir(
        `${cache_directory}/${directory}/${sub_directory}`
      );
      for (const file of files) {
        // open the file as a stream and read from it until we've either read 1mb
        // or we have encountered the string 'KEY: '... newline
        const stream = fs.createReadStream(
          `${cache_directory}/${directory}/${sub_directory}/${file}`,
          { encoding: "utf8" }
        );
        let data = "";
        for await (const chunk of stream) {
          data += chunk;
          if (data.length > 1024 * 1024) break;
          if (data.includes("KEY: ")) break;
        }
        const host_line = data.split("\n").find(line => line.includes("KEY: "));
        const parsed_url = require("url").parse(host_line.split("KEY: ")[1]);
        // we don't want the port
        const host = parsed_url.host.split(":")[0];
        cache[host] = cache[host] || [];
        cache[host].push(file);
      }
    }
  }

  // go through each host in the directory and then request
  // origin?host=host and compare the response to the cache
  for (const host of Object.keys(cache)) {
    const response = await fetch(`${origin}?host=${host}`);
    const data = await response.text();
    const cache_files = cache[host];
    const origin_files = data.trim().split("\n");
    const cache_files_set = new Set(cache_files);
    const origin_files_set = new Set(origin_files);
    const cache_only = cache_files.filter(file => !origin_files_set.has(file));
    const origin_only = origin_files.filter(file => !cache_files_set.has(file));

    if (cache_only.length || origin_only.length) {
      if (cache_only.length) {
        console.log(
          `host=${host} missing from shared dictionary: ${cache_only.join(
            ", "
          )}`
        );
      }
      //   if (origin_only.length) {
      //     console.log(`Origin only: ${origin_only.join(", ")}`);
      //   }
    }
  }

  return "";
};

if (require.main === module) {
  main(...process.argv.slice(2))
    .then(console.log)
    .catch(console.error);
}
module.exports = main;
