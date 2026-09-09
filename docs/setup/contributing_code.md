# How To Contribute Code To Firefox

The whole process can be a bit long, and it might take time to get things right.
If at any point you are stuck, please don't hesitate to ask at [https://chat.mozilla.org](https://chat.mozilla.org)
in the [#introduction](https://chat.mozilla.org/#/room/#introduction:mozilla.org) channel.
Additionally, here are some etiquette tips to help when reaching out:

- Please don't ask to ask a question, post your question with the relevant context and someone will be able to help when they have time.

- Use public facing channels to ask your questions instead of direct messaging folks.

  - Other people get to learn from your question and there's a higher chance your question will get answered quickly since there are many people in the #introduction room.

- Your question may not be answered immediately, this is expected! If you are not getting feedback after an hour or so, feel free to repost the question.

  - Sometimes messages get skimmed over or notifications are lost in the sea of other things, so it's normal to repost your question in this case.

- Please search through the recent scrollback of your relevant channels to see if your question has been asked and/or answered already.

  - Most issues with setup have been experienced before, so there's a good possibility that your question has already been answered recently.

We make changes to Firefox by writing patches, testing them and pushing them into "the tree", the
term we use for all the code in the
[firefox repository](https://github.com/mozilla-firefox/firefox). Let's get started.

Please see the {ref}`Firefox Contributors Quick Reference <firefox-contributors-quick-reference>` for simple check list.

## Finding something to work on

Bugs listed as 'Assigned' are not usually a good place to start,
unless you're sure you have something worthy to contribute. Someone
else is already working on it!

Even with no assignee, it is polite to check if someone has recently
commented that they're looking at fixing the issue.

Once you have found something to work on, go ahead and comment! Let
the bug submitter, reviewer, and component owner know that you'd like
to work on the bug. You might receive some extra information, and be
made the assignee.

(good-first-bug-guide)=

### Find a bug we've identified as a good fit for new contributors

With millions of bugs filed in Bugzilla, it can be hard to know
where to start, so we've created these bug categories to make getting
involved a little easier:

- [Codetribute](https://codetribute.mozilla.org/) - our site for
  finding bugs that are mentored, some are good first bugs, some are
  slightly harder. Your mentor will help guide you with the bug fix and
  through the submission and landing process.
- [Good First Bugs](https://bugzilla.mozilla.org/buglist.cgi?keywords=good-first-bug&resolution=---)
  \- are the best way to take your first steps into the Mozilla
  ecosystem. They're all about small changes, sometimes as little as a
  few lines, but they're a great way to learn about setting up your
  development environment, navigating Bugzilla, and making
  contributions to the Mozilla codebase.
- [Student Projects](https://bugzil.la/kw:student-project) - are
  larger projects, such as might be suitable for a university student
  for credit. Of course, if you are not a student, feel free to fix one
  of these bugs. See [our project list](https://bugzil.la/kw:student-project).

### Fix that one bug

If there's one particular bug you'd like to fix about Firefox, Thunderbird, or
your other favorite Mozilla application, this can be a great place to
start. There are a number of ways to do this:

- [Search bugzilla](https://bugzilla.mozilla.org/query.cgi) for
  relevant keywords. See pages on
  [Bugzilla and Searching Bugzilla](https://bmo.readthedocs.io/en/latest/using/finding.html) for further
  help
- Learn the [bugzilla
  component](https://bugzilla.mozilla.org/describecomponents.cgi),
  with which your pet bug is implemented, using the components list.
  Browse this component on bugzilla for related bugs

## Fixing your bug

We leave this in your hands. Here are some further resources to help:

- Check out
  {ref}`Our Developer Guide and its parent document <working-on-firefox>`
- Our {ref}`reviewer checklist <reviewer-checklist>` is very
  useful, if you have a patch near completion, and seek a favorable
  review
- Utilize our build tool {ref}`mach`, its linting,
  static analysis, and other code checking features

## Getting your code reviewed

Once you fix the bug, you can advance to having your code reviewed.
Mozilla uses
[Phabricator](https://moz-conduit.readthedocs.io/en/latest/phabricator-user.html)
for code review.

If you have a mentored bug, ask your mentor first: they will review the
patch, or can easily find out who should. Otherwise, see
{ref}`Getting reviews` for how to pick a reviewer or a review group, the
`r=` commit message syntax, and what to do when a review is not
happening.

### Following up and responding

For most new contributors, and even for long-time Mozillians, the first
review of your patch will be "Requested Changes" (or an "r-" in
Bugzilla). This does not mean you've done bad work. There is more work
to do before the code can be merged into the tree. Your patch may need
some changes - perhaps minor, perhaps major - and your reviewer will
give you some guidance on what needs to be done next.

This is an important process, so don't be discouraged! With our
long-lived codebase, and hundreds of millions of users, the care and
attention helping contributors bring good patches is the cornerstone of
the Mozilla project. Make any changes your reviewer seeks; if you're
unsure how, be sure to ask!

See {ref}`addressing-review-comments` for how to update and resubmit
your patch.

## Getting code into Firefox

Once your patch has been accepted, it is ready to go. Before it can be
merged into the tree, your patch will need to complete a successful run
through our {ref}`try server <pushing-to-try>`,
making sure there are no unexpected regressions. If you don't have try
server access already, your mentor, or the person who reviewed your
patch, will be able to help.

Ask the reviewer to land the patch for you.
For more details, see {ref}`push-a-change`

## Do it all again

Thank you. You've fixed your very first bug, and the Open Web is
stronger for it. But don't stop now.

There is plenty more to do. Your mentor might suggest a new bug for you
to work on, or you can
{ref}`find one that interests you <good-first-bug-guide>`.

As you fix more bugs, you can request more access to Mozilla
infrastructure so you can push to try and eventually land your own code.
See {ref}`Levelling up`.

## More information

- [A beginner's guide to SpiderMonkey, Mozilla's Javascript
  engine](https://wiki.mozilla.org/JavaScript:New_to_SpiderMonkey)
