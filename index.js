#!/usr/bin/env node

'use strict'

const { exec } = require('child_process')
const { promisify: pify } = require('util')
const fetch = require('node-fetch')

async function getToken() {
  const { stdout } = await pify(exec)('pass show tokens/github/repo')
  return stdout.trim()
}

async function getPullRequests(token) {
  const url = 'https://api.github.com/graphql'
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `bearer ${token}`
    },
    body: JSON.stringify({
      query: `
        query {
          viewer {
            pullRequests(first: 100, states: OPEN) { 
              pageInfo {
                hasNextPage
                endCursor
              }
              nodes {
                title
                number
                url
                repo: repository {
                  nameWithOwner
                }
              }
            }
          }
        }
      `
    })
  })

  const { data } = await res.json()

  return data.viewer.pullRequests.nodes.map((pr) => ({
    number: pr.number,
    repo: pr.repo.nameWithOwner,
    url: pr.url,
    displayText: `${pr.repo.nameWithOwner} - #${pr.number} (${pr.title})`.replace(/"/g, '\\"')
  }))
}

async function prompt(pulls) {
  const args = pulls.map((pr) => pr.displayText).join('\n')
  return await pify(exec)(`echo "${args}" | dmenu -i`)
}

function parseStdout(stdout) {
  const [_, repo, number] = stdout.match(/(.+) - #(\d+)/)
  return { repo, number: parseInt(number, 10) }
}

async function main() {
  try {
    const token = await getToken()
    const pulls = await getPullRequests(token)
    const { stdout } = await prompt(pulls)
    const { repo, number } = parseStdout(stdout)
    const { url } = pulls.find((pr) => pr.number === number && pr.repo === repo)
    await pify(exec)(`xdg-open ${url}`)
  } catch (e) {
    await pify(exec)(`notify-send "pullmenu error" "${e.message}"`)
  }
}

main()