# Contributing Guide

Thank you for investing your time in contribution to the dokieli project!

The [dokieli/dokieli](https://github.com/dokieli/dokieli) repository
contains the source code of the work on [dokieli](https://dokie.li/) project.

## Dive into contributing

* Use it. Break it. Report it. Fix it.
* Improve documentation (for the website or repository)
* Publish or translate articles and share them. Add yours to the [examples in the wild](https://github.com/dokieli/dokieli/wiki#examples-in-the-wild).
* Join the [dokieli chat](https://matrix.to/#/%23dokieli:matrix.org) for help and discussion.
* Encourage the ideas/movement and however else you want to contribute.
* We want your feedback! Create issues (or PRs!) for use cases or features or you would like to have.

## Code of conduct

We have a [Code of Conduct](CODE-OF-CONDUCT.md) to help keep our community
inclusive, welcoming, and friendly.

See [additional
resources](https://www.w3.org/about/positive-work-environment/#Education) for
education and training to promote a positive work environment.

## Development

* General background in [dokieli documentation](https://dokie.li/docs).
* See [fork a repo](https://help.github.com/articles/fork-a-repo/) to setup
your own development repository and stay
[synchronised](https://help.github.com/articles/syncing-a-fork). Useful later
to make pull requests. For example, using your fork at `https://github.com/YOUR-USERNAME/dokieli` :

Clone your work repository, for example:

```sh
git clone git@github.com:YOUR-USERNAME/dokieli
cd dokieli
```

Install packages:

```sh
yarn
```

Make your code updates at src/ , media/ etc.

Build eg. to create scripts/dokieli.js:

```sh
yarn build
```

or automatically rebuild when files change:

```sh
yarn watch
```

or create a minified scripts/dokieli.js:

```sh
yarn minify
```

To serve static files, you can use any HTTP server, e.g.:

```sh
npx serve
```

## Tests

### Unit tests

dokieli uses [Jest](https://jestjs.io/) for unit tests. 

To run unit tests, run:

```sh
yarn test
```

Coverage reports are collected in `tests/coverage`.

### End-to-end tests

In order to ensure intended and consistent behaviour across web browsers, dokieli uses [Playwright](https://playwright.dev/) for end-to-end browser tests.

To run end-to-end tests, run:

```sh
yarn test:e2e
```

Reports are collected in `playwright-report/`.

Some tests require authentication. To run these tests, you will need to have an `.env` file with credentials. See the `.env.example` file.

## Code quality

We use [eslint](https://eslint.org/) to enforce consistent code style and catch potential errors in our JavaScript code. To lint our code, run:

```sh
yarn lint
```

We use a [husky](https://typicode.github.io/husky) pre-commit hook to run tests and lint before every commit. To opt-in, run:

```sh
yarn husky
```

You only need to run this once. After this, husky will run the linter and the tests each time you make a commit.

## Creating a pull request

* Include atomic commits, small PRs: "one concern, one PR".
* In the PR comment, provide as much context and evidence to help reviewers
  evaluate the PR. Identify, classify, describes the changes.
* Don't forget to [link PR to
  issue](https://docs.github.com/en/issues/tracking-your-work-with-issues/linking-a-pull-request-to-an-issue)
  if you are solving one.
* If you run into any merge issues, checkout this [git
  tutorial](https://lab.github.com/githubtraining/managing-merge-conflicts) to
  help you resolve merge conflicts and other issues.
* You can attribute a commit to more than one author by adding one or more
  `Co-authored-by: Name <name@example.com>` per line to commit's message
  (after two empty lines). See [github
  tutorial](https://docs.github.com/en/pull-requests/committing-changes-to-your-project/creating-and-editing-commits/creating-a-commit-with-multiple-authors).
* To help maintain a clean Git history, consider using [squash
  merge](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/about-merge-methods-on-github#squashing-your-merge-commits)
  for PRs, especially when incorporating reviews and code additions.

Your PR is merged! okieli dokieli :tada: Thank you! :sparkles:.
