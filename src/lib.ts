import { exec } from 'child_process'
import { promisify as pify } from 'util'

export async function getToken(): Promise<string> {
  const { stdout } = await pify(exec)('pass show tokens/github/repo')
  return stdout.trim()
}

export async function prompt(options: string[]): Promise<string> {
  const { stdout } = await pify(exec)(
    `echo "${options.join('\n').replace(/"/g, '\\"')}" | dmenu -i`
  )
  return stdout.trim()
}
