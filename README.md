# ghmenu

> Navigate to a GitHub repo, issue, or pull request via [dmenu][]

![recording][]

# Installation

This package is published via [npm][] and requires [Node >=10](https://nodejs.org)

Install globally with your node package manager of choice

_e.g._
```
$ npm install -g ghmenu

$ yarn global add ghmenu
```

# Usage

ghmenu requires a [GitHub personal access token](https://github.com/settings/tokens) with `repo` access to be stored via [pass][] as `tokens/github/repo`. This prevents the need to keep it hanging around on your machine as an environment variable, or otherwise insecurely stored.

If you've never used pass before, install and initialize it first as described in [here][pass], then generate your token, and store it as such...

```bash
$ pass insert tokens/github/repo
```

Now you may call `ghmenu` from the terminal, although you probably want to bind it to a hotkey. Using i3, you may add the following line to your `~/.config/i3/config` file...

```
bindsym $mod+g exec --no-startup-id ghmenu
```

# Troubleshooting

- Make sure you have Node >=10 installed and available from the environment that ghmenu is being invoked from. If you use `n`, `nvm`, or some other Node version manager, the `node` bin _may not exist_ outside of your shell

- Ensure your node package manager's global bin directory has been added to the PATH. You may wish to use `$(npm bin -g)/ghmenu` or `$(yarn global bin)/ghmenu` in your i3 (or wherever) config

[recording]: ./recording.gif
[dmenu]: https://wiki.archlinux.org/index.php/Dmenu
[pass]: https://wiki.archlinux.org/index.php/Pass
[npm]: https://npmjs.org
