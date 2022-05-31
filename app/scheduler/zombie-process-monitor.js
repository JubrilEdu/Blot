const config = require("config");
const exec = require("child_process").exec;
const email = require("helper/email");
const async = require("async");

if (require.main === module) {
  main(function (err) {
    if (err) throw err;
    process.exit();
  });
}

function main(callback) {
  exec(
    `ps -e -o ppid= -o pid= -o command= | grep "node ${config.blot_directory}" | awk '$1 == "1" { print $2 }'`,
    function (err, stdout) {
      if (err) return callback(err);

      const zombie_pids = stdout.split("\n").filter((i) => !!i);

      async.eachSeries(
        zombie_pids,
        (pid, next) => {
          console.log("found pid", pid);
          next();
        },
        callback
      );

      // if (config.environment === "development") {
      //   // this is annoying in development
      // } else {
      //   console.log(clfdate(), "[STATS]", "top");
      //   console.log(stdout);
      // }
    }
  );
}

module.exports = main;
