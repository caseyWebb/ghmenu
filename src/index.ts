#!/usr/bin/env node

import { prompt } from './lib'

async function promptResource(): Promise<string> {
  return await prompt(['repos', 'pulls', 'issues'])
}

async function main(): Promise<void> {
  const resource = await promptResource()

  switch (resource) {
    case 'pulls':
      require('./pullmenu')
      break
  }
}

main()
