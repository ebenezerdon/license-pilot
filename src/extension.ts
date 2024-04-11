import * as vscode from 'vscode'
import * as https from 'https'

// Helper function to perform HTTPS GET requests
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

// Fetches licenses from GitHub API
const fetchLicenses = async (): Promise<Array<{ key: string; name: string }>> => {
  const options = { headers: { 'User-Agent': 'VSCode License Extension' } }
  const { statusCode, body } = await httpsGet('https://api.github.com/licenses', options)

  if (statusCode !== 200) {
    throw new Error(`Request failed with status code: ${statusCode}`)
  }

  try {
    return JSON.parse(body)
  } catch (error) {
    throw new Error('Failed to parse JSON response for licenses')
  }
}

// Fetches specific license content
const fetchLicenseContent = async (key: string): Promise<string> => {
  const options = { headers: { 'User-Agent': 'VSCode License Extension' } }
  const { statusCode, body } = await httpsGet(`https://api.github.com/licenses/${key}`, options)

  if (statusCode !== 200) {
    throw new Error(`Request failed with status code: ${statusCode}`)
  }

  try {
    const content = JSON.parse(body)
    return content.body
  } catch (error) {
    throw new Error('Failed to parse JSON response for license content')
  }
}

// Check if the LICENSE file exists and prompt the user for action if it does
const checkAndWriteLicenseFile = async (licenseFilePath: vscode.Uri, licenseContent: string): Promise<void> => {
  try {
    // Check if the LICENSE file exists
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

    // Write the LICENSE file
    await vscode.workspace.fs.writeFile(licenseFilePath, Buffer.from(licenseContent, 'utf8'))
    vscode.window.showInformationMessage('License file added to your project.')
  } catch (error) {
    vscode.window.showErrorMessage(`Error: ${error instanceof Error ? error.message : String(error)}`)
  }
}

// Activate function - registers the command and handles the logic
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
