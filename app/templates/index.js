var config = require("config");
var Template = require("template");
var capitalize = require("helper/capitalize");
var extend = require("helper/extend");
var basename = require("path").basename;

var fs = require("fs-extra");
var async = require("async");
var Blog = require("blog");

var TEMPLATES_DIRECTORY = require("path").resolve(__dirname + "/latest");
var PAST_TEMPLATES_DIRECTORY = require("path").resolve(__dirname + "/past");
var TEMPLATES_OWNER = "SITE";

if (require.main === module) {
  main({ watch: true }, function (err) {
    if (err) throw err;
    process.exit();
  });
}

function main(options, callback) {
  buildAll(TEMPLATES_DIRECTORY, options, function (err) {
    if (err) return callback(err);

    buildAll(PAST_TEMPLATES_DIRECTORY, options, function (err) {
      if (err) return callback(err);

      checkForExtinctTemplates(TEMPLATES_DIRECTORY, function (err) {
        if (err) return callback(err);

        if (options.watch) {
          watch(TEMPLATES_DIRECTORY);
          watch(PAST_TEMPLATES_DIRECTORY);
        } else {
          callback(null);
        }
      });
    });
  });
}

// Builds any templates inside the directory
function buildAll(directory, options, callback) {
  var dirs = templateDirectories(directory);

  async.map(dirs, async.reflect(build), function (err, results) {
    results.forEach(function (result, i) {
      if (result.error) {
        if (!options.watch) {
          return callback(result.error);
        } else {
          console.log();
          console.error("Error building: " + dirs[i]);
          console.error(result.error.stack);
          console.log();
        }
      }
    });

    callback();
  });
}

// Path to a directory containing template files
function build(directory, callback) {
  console.log("..", require("path").basename(directory), directory);

  var templatePackage, isPublic;
  var name, template, description, id;

  try {
    templatePackage = fs.readJsonSync(directory + "/package.json");
  } catch (e) {
    templatePackage = {};
    console.warn("     ", "Warning: ENOENT " + directory + "/package.json");
    // package.json is optional
  }

  id = TEMPLATES_OWNER + ":" + basename(directory);
  name = templatePackage.name || capitalize(basename(directory));
  description = templatePackage.description || "";
  isPublic = templatePackage.isPublic !== false;

  template = {
    isPublic: isPublic,
    description: description,
    locals: templatePackage.locals,
  };

  Template.drop(TEMPLATES_OWNER, basename(directory), function () {
    Template.create(TEMPLATES_OWNER, name, template, function (err) {
      if (err) return callback(err);

      buildViews(directory, id, templatePackage.views, function (err) {
        if (err) return callback(err);

        emptyCacheForBlogsUsing(id, function (err) {
          if (err) return callback(err);

          if (!isPublic || config.environment !== "development")
            return callback();

          mirror(id, callback);
        });
      });
    });
  });
}

function mirror(id, callback) {
  Blog.getAllIDs(function (err, ids) {
    if (err) return callback(err);
    async.eachSeries(
      ids,
      function (blogID, next) {
        Template.drop(
          blogID,
          "mirror-of-" + id.slice(id.indexOf(":") + 1),
          function (err) {
            var template = {
              isPublic: false,
              cloneFrom: id,
              name: "Mirror of " + id.slice(id.indexOf(":") + 1),
              slug: "mirror-of-" + id.slice(id.indexOf(":") + 1),
            };

            Template.create(blogID, template.name, template, next);
          }
        );
      },
      callback
    );
  });
}

function buildViews(directory, id, views, callback) {
  var viewpaths;

  viewpaths = fs.readdirSync(directory).map(function (n) {
    return directory + "/" + n;
  });

  async.eachSeries(
    viewpaths,
    function (path, next) {
      var viewFilename = basename(path);

      if (viewFilename === "package.json" || viewFilename.slice(0, 1) === ".")
        return next();

      var viewName = viewFilename;
      var viewContent;
      if (viewName.slice(0, 1) === "_") {
        viewName = viewName.slice(1);
      }

      try {
        viewContent = fs.readFileSync(path, "utf-8");
      } catch (err) {
        return next();
      }

      var view = {
        name: viewName,
        content: viewContent,
        url: "/" + viewName,
      };

      if (views && views[view.name]) {
        var newView = views[view.name];
        extend(newView).and(view);
        view = newView;
      }

      Template.setView(id, view, function onSet(err) {
        if (err) {
          view.content = err.toString();
          Template.setView(id, view, function () {});
          err.message += " in " + path;
          return next(err);
        }

        next();
      });
    },
    callback
  );
}

function checkForExtinctTemplates(directory, callback) {
  var names = fs.readdirSync(directory).map(function (name) {
    return name.toLowerCase();
  });

  console.log("Checking for extinct templates...");

  Template.getTemplateList("", function (err, templates) {
    if (err) return callback(err);

    templates = templates.filter(function (template) {
      return template.owner === TEMPLATES_OWNER;
    });

    templates = templates.filter(function (template) {
      return names.indexOf(template.name.toLowerCase()) === -1;
    });

    if (templates.length) {
      console.log(
        templates.length +
          " templates no longer exist. Please run these scripts to safely remove them from the database:"
      );
    }

    templates.forEach(function (template) {
      console.log(
        "node scripts/template/archive.js",
        template.id.split(":")[1]
      );
    });

    callback();
  });
}

function watch(directory) {
  // Stop the process from exiting automatically
  process.stdin.resume();
  console.log("Watching", directory, "for changes...");

  var queue = async.queue(function (directory, callback) {
    build(directory, function (err) {
      if (err) {
        console.error(err.message);
      }

      callback();
    });
  });

  fs.watch(directory, { recursive: true }, function (event, path) {
    var subdirectory = require("path").dirname(path).split("/")[0];

    queue.push(directory + "/" + subdirectory);
  });
}

// Generate list of template names based on the names of
// directories inside $directory (e.g. ['console', ...])
function templateDirectories(directory) {
  return fs
    .readdirSync(directory)
    .filter(function (name) {
      return (
        name[0] !== "." &&
        name !== "_" &&
        name.toLowerCase().indexOf("readme") === -1
      );
    })
    .map(function (name) {
      return directory + "/" + name;
    });
}

function emptyCacheForBlogsUsing(templateID, callback) {
  Blog.getAllIDs(function (err, ids) {
    if (err) return callback(err);
    async.eachSeries(
      ids,
      function (blogID, next) {
        Blog.get({ id: blogID }, function (err, blog) {
          if (err || !blog || !blog.template || blog.template !== templateID)
            return next();

          Blog.set(blogID, { cacheID: Date.now() }, function (err) {
            if (err) return next(err);

            console.log(
              "..",
              templateID,
              "flushed for",
              blog.handle + " (" + blog.id + ")"
            );
            next();
          });
        });
      },
      callback
    );
  });
}

module.exports = main;
