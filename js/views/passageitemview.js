/**
 This handles display of a single passage in a story map
 managed by StoryEditView.

 @class PassageItemView
 @extends Marionette.ItemView
**/

PassageItemView = Marionette.ItemView.extend(
{
	template: '#templates .passageItemView',
	className: 'passage',

	/**
	 If true, then any change in the model's position
	 properties will be animated instead of immediately
	 changed.

	 @property animateMovement
	 @type Boolean
	**/

	animateMovement: false,

	initialize: function (options)
	{
		this.listenTo(this.model, 'change', this.render);
		this.parentView = options.parentView;
		this.listenTo(this.parentView, 'zoom', this.render);
	},

	onRender: function()
	{
		var zoom = this.parentView.model.get('zoom');
		var top = this.model.get('top') * zoom;
		var left = this.model.get('left') * zoom;

		// have to set absolute positioning manually,
		// or draggable() will manually apply absolute for us

		this.$el
		.attr('data-id', this.model.id)
		.css('position', 'absolute')
		.draggable(
		{
			cursor: 'move',
			addClasses: false,
			containment: 'parent'
		});

		// set CSS class for broken links

		var links = this.model.links();
		var broken = false;

		if (_.every(this.model.links(), function (link)
		{
			return this.parentView.collection.findWhere({ name: link });
		}, this))
			this.$el.removeClass('brokenLink');
		else
			this.$el.addClass('brokenLink');

		if (this.animateMovement)
			this.$el.animate({ left: left, top: top }, 100);
		else
			this.$el.css({ left: left, top: top });
	},

	serializeData: function()
	{
		// add the excerpt manually after saving data

		var data = this.model.toJSON();
		data.excerpt = this.model.excerpt();
		return data;
	},

	/**
	 Deletes the underlying passage model.

	 @method delete
	**/

	delete: function()
	{
		var model = this.model;

		this.disappear(function()
		{
			model.destroy();
		});
	},

	/**
	 Begins editing this passage in a modal dialog.

	 @method edit
	**/

	edit: function()
	{
		// remember current set of broken links 
		// so if the user adds one during editing, we'll
		// create a passage for them

		this.oldBrokenLinks = _.filter(this.model.links(), function (link)
		{
			return this.parentView.collection.findWhere({ name: link });
		}, this);

		$('#passageEditModal .passageId').val(this.model.id);
		$('#passageEditModal .passageName').val(this.model.get('name'));

		// don't prepopulate textarea if all we have is default text

		var text = this.model.get('text');
		$('#passageEditModal .passageText').val((text == Passage.prototype.defaults.text) ? '' : text);
		$('#passageEditModal .savePassage').on('click', { view: this }, this.finishEdit);
		$('#passageEditModal').modal(
		{
			keyboard: false,
			backdrop: 'static'
		});

		$('body').on('keyup', this.handleShortcuts);
	},

	/**
	 Updates the model after editing it in the modal created by edit().

	 @method finishEdit
	**/
	
	finishEdit: function (e)
	{
		var view = e.data.view;

		if (view.model.save(
		{
			name: $('#passageEditModal .passageName').val(),
			text: $('#passageEditModal .passageText').val()
		}))
		{
			// successful save
			// create passages for new broken links

			var newTop = view.model.get('top') + Passage.height * 1.5;
			var newLeft = view.model.get('left');

			_.each(view.model.links(), function (link)
			{
				if (! view.parentView.collection.findWhere({ name: link }) &&
					view.oldBrokenLinks.indexOf(link) == -1)
				{
					var passage = new Passage(
					{
						story: view.model.get('story'),
						name: link,
						top: newTop,
						left: newLeft
					});

					view.parentView.collection.add(passage);
					view.parentView.positionPassage(passage);
					passage.save();
					view.parentView.children.findByModel(passage).appear();
					newLeft += Passage.width * 1.5;
				};
			});

			$('#passageEditModal .alert').remove();
			$('#passageEditModal .savePassage').off('click');
			$('#passageEditModal').modal('hide');	
		}
		else
		{
			// show the error message

			var message = $('#passageEditModal .alert');
			
			if (message.size() == 0)
				message = $('<p class="alert alert-danger">')
				.text(e.data.model.validationError);

			$('#passageEditModal textarea').before(message);
			message.hide().fadeIn();
			$('#passageEditModal .passageName').focus();
		};
	},

	/**
	 Animates the view as if it were apppearing onscreen for the first time.

	 @method appear
	 @param {Function} callback Function to call when the animation is done.
	**/

	appear: function (callback)
	{
		if (callback)
			this.$el.on('animationend webkitAnimationEnd MSAnimationEnd', function()
			{
				callback();
				$(this).off('animationend webkitAnimationEnd MSAnimationEnd');
			});

		this.$el.addClass('appear');
	},

	/**
	 Animates the view as if it were disappearing onscreen.

	 @method disappear
	 @param {Function} callback Function to call when the animation is done.
	**/

	disappear: function (callback)
	{
		if (callback)
			this.$el.on('animationend webkitAnimationEnd MSAnimationEnd', function()
			{
				callback();
				$(this).off('animationend webkitAnimationEnd MSAnimationEnd');
			});

		this.$el.addClass('disappear');
	},

	/**
	 Listens for the Escape key during editing of a passage, simulating a
	 click of the Done button.

	 @method handleShortcuts
	 @param {Object} event Standard jQuery event object.
	**/

	handleShortcuts: function (event)
	{
		// escape key

		if (event.keyCode == 27)
			$('#passageEditModal .savePassage').click();
	},

	/**
	 Performs all operations needed for the end of a drag of the DOM
	 element, including updating the model.

	 @method endDrag
	 @param {Object} event Standard jQuery event object.
	 @param {Object} ui jQuery UI event object.
	**/

	endDrag: function (event, ui)
	{
		var zoom = this.parentView.model.get('zoom');
	
		// set initial position based on the user's drag

		this.model.set(
		{
			top: ui.position.top / zoom,
			left: ui.position.left / zoom	
		});

		// push the passage so it doesn't overlap any other
		
		this.animateMovement = true;
		this.parentView.positionPassage(this.model);	
		this.animateMovement = false;

		// and finally save changes
		// I don't get it, but we have to specify the attributes manually
		// or this will save our pre-drag position

		this.model.save({ top: this.model.get('top'), left: this.model.get('left') });
	},

	events:
	{
		'click .delete': 'delete',
		'dragstop': 'endDrag',
		'click .edit': 'edit',
		'dblclick': 'edit'
	}
});