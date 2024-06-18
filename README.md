# i18n-tools

## How to add as a dependency

To add this private git npm module as a dev dependency you can use something like:

    `yarn add --dev git+ssh://git@github.com:viviedu/i18n-tools.git#1.0.1`

To update the version of this tool you need to push a git version tag for that to work as well.

    git push origin tag 1.0.1

## CROWDIN_TOKEN

Get the Crowdin API key which is a note on the dev login: [1Password](https://start.1password.com/open/i?a=YH7LPAF5DJDUFG6YUGOPHWOYRE&h=vivi-team.1password.com&i=am4ulaz6frfte5t2x3ivs2gzzq&v=h6rvidgxokv2peil4j2al3al74)

It’s recommended you put that into your .zshrc or .env or equivalent.

    export CROWDIN_TOKEN=468**************************

More info on [Confluence](https://vivi-internal.atlassian.net/wiki/spaces/EN/pages/817889305/Crowdin+Pre+Translate+Script)
