# Installation

Install the dependency globally

```
npm i -g @gcamara/gs-angular-migration-tool
```

# Usage

To run the script, go under the project you want to upgrade and run

```
gs-angular-migration-tool [--verbose] [--to-version=version] [--start-after-install]
```

### Options

| Option                 | Default | Description                                                                                            |
| ---------------------- | ------- | ------------------------------------------------------------------------------------------------------ |
| --verbose              | false   | The output from the installation will be displayed. This means showing results of `ng update` commands |
| --to-version=[version] | 12      | Specify the final version to which you want to upgrade.                                                |
| --start-after-install  | false   | Runs `npm start` after the upgrade is complete                                                         |
