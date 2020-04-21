const helper = require("helper");
const bodyParser = require("body-parser").urlencoded({ extended: false });
const Express = require("express");
const SourceCode = new Express.Router();
const Template = require("template");
const formJSON = helper.formJSON;
const extend = helper.extend;

SourceCode.use(require("./load/template-views"));

SourceCode.use(function(req, res, next) {
	res.locals.partials.sidebar = "template-editor/source-code/sidebar";
	res.locals.partials.header = "template-editor/source-code/header";
	next();
});

SourceCode.route("/").get(function(req, res) {
	if (res.locals.views[0] && res.locals.views[0].name) {
		return res.redirect(
			res.locals.base + "/source-code/" + res.locals.views[0].name + "/edit"
		);
	}

	res.locals.partials.yield = "template-editor/source-code/edit";
	res.render("template-editor/layout");
});

SourceCode.route("/create")
	.get(function(req, res) {
		res.locals.partials.yield = "template-editor/source-code/create";
		res.render("template-editor/layout");
	})
	.post(bodyParser, function(req, res, next) {
		const name = req.body.name;

		if (req.params.viewSlug === "package.json") {
			return next(new Error("You cannot name a view package.json"));
		}

		Template.setView(req.template.id, { name }, function(err) {
			if (err) return next(err);
			res.redirect(res.locals.base + "/source-code/" + name + "/edit");
		});
	});

SourceCode.param("viewSlug", require("./load/template-view"));

SourceCode.route("/:viewSlug/edit")
	.get(function(req, res) {
		res.locals.title = `${req.view.name} - ${req.template.name}`;
		res.locals.partials.yield = "template-editor/source-code/edit";
		res.render("template-editor/layout");
	})
	.post(bodyParser, function(req, res) {
		var view = formJSON(req.body, Template.viewModel);

		view.name = req.view.name;
		
		if (req.params.viewSlug === "package.json") {
			Template.package.save(
				req.template.id,
				JSON.parse(view.content),
				function(err) {
					if (err) return next(err);
					res.send("Saved changes!");
				}
			);
		} else {
			Template.setView(req.template.id, view, function(err) {
				if (err) return next(err);

				res.send("Saved changes!");
			});
		}
	});

SourceCode.route("/:viewSlug/rename")
	.get(function(req, res, next) {
		if (req.params.viewSlug === "package.json") {
			return next(new Error("You cannot rename package.json"));
		}

		res.locals.partials.yield = "template-editor/source-code/rename";
		res.locals.title = `Rename - ${req.view.name} - ${req.template.name}`;
		res.render("template-editor/layout");
	})
	.post(bodyParser, function(req, res, next) {
		if (req.params.viewSlug === "package.json") {
			return next(new Error("You cannot rename package.json"));
		}

		var view = formJSON(req.body, Template.viewModel);

		view.locals = view.locals || {};

		extend(view).and(req.view);

		var newName = view.name;
		var oldName = req.params.viewSlug;

		Template.getView(req.template.id, newName, function(err, existingView) {
			if (existingView && !err)
				return next(new Error("A view called " + newName + " already exists"));

			Template.setView(req.template.id, view, function(err) {
				if (err) return next(err);

				Template.dropView(req.template.id, oldName, function(err) {
					if (err) return next(err);

					res.message(
						res.locals.base + "/source-code/" + newName + "/edit",
						"Saved changes!"
					);
				});
			});
		});
	});

SourceCode.route("/:viewSlug/delete")
	.get(function(req, res, next) {
		res.locals.partials.yield = "template-editor/source-code/delete";
		res.locals.title = `Delete - ${req.view.name} - ${req.template.name}`;
		res.render("template-editor/layout");
	})
	.post(bodyParser, function(req, res, next) {
		Template.dropView(req.template.id, req.view.name, function(err) {
			if (err) return next(err);
			res.redirect(res.locals.base + "/source-code");
		});
	});

module.exports = SourceCode;
