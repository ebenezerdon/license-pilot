import * as vscode from 'vscode'
import * as https from 'https'

const fetchLicenses = async (): Promise<{ key: string; name: string }[]> => {
  return new Promise((resolve, reject) => {
    https
      .get('https://api.github.com/licenses', { headers: { 'User-Agent': 'VSCode License Extension' } }, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`Request failed with status code: ${res.statusCode}`))
          return
        }

        let data = ''
        res.on('data', (chunk) => (data += chunk))
        res.on('end', () => {
          try {
            resolve(JSON.parse(data))
          } catch (error) {
            reject(new Error('Failed to parse JSON response'))
          }
        })
      })
      .on('error', reject)
  })
}

const fetchLicenseContent = async (key: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    https
      .get(
        `https://api.github.com/licenses/${key}`,
        { headers: { 'User-Agent': 'VSCode License Extension' } },
        (res) => {
          if (res.statusCode !== 200) {
            reject(new Error(`Request failed with status code: ${res.statusCode}`))
            return
          }

          let data = ''
          res.on('data', (chunk) => (data += chunk))
          res.on('end', () => {
            try {
              const license = JSON.parse(data)
              resolve(license.body)
            } catch (error) {
              reject(new Error('Failed to parse JSON response'))
            }
          })
        },
      )
      .on('error', reject)
  })
}

function activate(context: vscode.ExtensionContext) {
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
          await vscode.workspace.fs.writeFile(licenseFilePath, Buffer.from(licenseContent, 'utf8'))
          vscode.window.showInformationMessage(`License ${selected.label} added to your project.`)
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

function deactivate() {}

module.exports = {
  activate,
  deactivate,
}
