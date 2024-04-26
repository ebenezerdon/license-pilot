import * as vscode from 'vscode'
import * as https from 'https'
import { Cache } from '@ebenezerdon/ts-node-cache'

const cache = new Cache()

/* Helper function to perform HTTPS GET requests */
const httpsGet = (
  url: string,
  options: https.RequestOptions,
): Promise<{ statusCode: number | undefined; body: string }> => {
  return new Promise((resolve, reject) => {
    const req = https.get(url, options, (res) => {
      let data = ''
      res.on('data', (chunk: string) => (data += chunk))
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data }))
    })
    req.on('error', reject)
    req.end()
  })
}

/* Fetches licenses from GitHub API using cache */
const fetchLicenses = async (): Promise<Array<{ key: string; name: string }>> => {
  const cacheKey = 'github-licenses'
  const cachedData = cache.get(cacheKey)
  if (cachedData) {
    return cachedData as Array<{ key: string; name: string }>
  }

  const options = { headers: { 'User-Agent': 'VSCode License Extension' } }
  const { statusCode, body } = await httpsGet('https://api.github.com/licenses', options)

  if (statusCode !== 200) {
    throw new Error(`Request failed with status code: ${statusCode}`)
  }

  try {
    const data = JSON.parse(body)
    cache.put(cacheKey, data, 3600) // cache for 1 hour
    return data
  } catch (error) {
    throw new Error('Failed to parse JSON response for licenses')
  }
}

/* Fetches specific license content using cache */
const fetchLicenseContent = async (key: string): Promise<string> => {
  const cacheKey = `license-content-${key}`
  const cachedContent = cache.get(cacheKey)
  if (cachedContent) {
    return cachedContent as string
  }

  const options = { headers: { 'User-Agent': 'VSCode License Extension' } }
  const { statusCode, body } = await httpsGet(`https://api.github.com/licenses/${key}`, options)

  if (statusCode !== 200) {
    throw new Error(`Request failed with status code: ${statusCode}`)
  }

  try {
    const content = JSON.parse(body).body
    cache.put(cacheKey, content, 3600) // cache for 1 hour
    return content
  } catch (error) {
    throw new Error('Failed to parse JSON response for license content')
  }
}

/* Check if the LICENSE file exists and prompt the user for action if it does */
const checkAndWriteLicenseFile = async (licenseFilePath: vscode.Uri, licenseContent: string): Promise<void> => {
  try {
    const fileExists = await vscode.workspace.fs.stat(licenseFilePath).then(
      () => true,
      () => false,
    )

    if (fileExists) {
      const overwrite = await vscode.window.showWarningMessage(
        'A LICENSE file already exists. Do you want to overwrite it?',
        'Yes',
        'No',
      )

      if (overwrite !== 'Yes') {
        vscode.window.showInformationMessage('License addition cancelled.')
        return
      }
    }

    /* Write the LICENSE file */
    await vscode.workspace.fs.writeFile(licenseFilePath, Buffer.from(licenseContent, 'utf8'))
    vscode.window.showInformationMessage('License file added to your project.')
  } catch (error) {
    vscode.window.showErrorMessage(`Error: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/* Activate function - registers the command and handles the logic */
export function activate(context: vscode.ExtensionContext): void {
  let disposable = vscode.commands.registerCommand('extension.addLicense', async () => {
    try {
      const licenses = await fetchLicenses()
      const pickItems = licenses.map((license) => ({ label: license.name, description: license.key }))
      const selected = await vscode.window.showQuickPick(pickItems, { placeHolder: 'Choose a license' })

      if (selected) {
        const licenseContent = await fetchLicenseContent(selected.description)
        const workspaceFolders = vscode.workspace.workspaceFolders

        if (workspaceFolders && workspaceFolders.length > 0) {
          const licenseFilePath = vscode.Uri.joinPath(workspaceFolders[0].uri, 'LICENSE')
          await checkAndWriteLicenseFile(licenseFilePath, licenseContent)
        } else {
          vscode.window.showErrorMessage('No open workspace found.')
        }
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Error: ${error instanceof Error ? error.message : String(error)}`)
    }
  })

  context.subscriptions.push(disposable)
}

export function deactivate(): void {}
