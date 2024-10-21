export async function extract(filePath: string): Promise<string> {
  try {
    const sourceCode = await Bun.file(filePath).text()

    return generateDtsTypes(sourceCode)
  }
  catch (error) {
    console.error(error)
    throw new Error(`Failed to extract and generate .d.ts file`)
  }
}

export function generateDtsTypes(sourceCode: string): string {
  const lines = sourceCode.split('\n')
  const dtsLines: string[] = []
  const imports: string[] = []
  const exports: string[] = []

  let isMultiLineDeclaration = false
  let currentDeclaration = ''
  let bracketCount = 0
  let lastCommentBlock = ''

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Handle comments
    if (line.trim().startsWith('/**') || line.trim().startsWith('*') || line.trim().startsWith('*/')) {
      if (line.trim().startsWith('/**'))
        lastCommentBlock = ''
      lastCommentBlock += `${line}\n`
      continue
    }

    if (isMultiLineDeclaration || line.trim().startsWith('export const') || line.trim().startsWith('export function')) {
      currentDeclaration += `${line}\n`
      bracketCount += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length

      if (bracketCount === 0 || (i === lines.length - 1 && !line.trim().endsWith(','))) {
        if (lastCommentBlock) {
          dtsLines.push(lastCommentBlock.trimEnd())
          lastCommentBlock = ''
        }
        const processed = processDeclaration(currentDeclaration.trim())
        if (processed)
          dtsLines.push(processed)
        isMultiLineDeclaration = false
        currentDeclaration = ''
      }
      else {
        isMultiLineDeclaration = true
      }
    }
    else if (line.trim().startsWith('export') || line.trim().startsWith('import') || line.trim().startsWith('interface')) {
      if (lastCommentBlock) {
        dtsLines.push(lastCommentBlock.trimEnd())
        lastCommentBlock = ''
      }
      const processed = processDeclaration(line)
      if (processed)
        dtsLines.push(processed)
    }
  }

  // Combine imports, declarations, and exports
  const result = [
    ...imports,
    '',
    ...dtsLines,
    '',
    ...exports,
  ].filter(Boolean).join('\n')

  return result
}

function parseObjectLiteral(objectLiteral: string): string {
  // Remove the opening and closing braces and any newlines
  const content = objectLiteral.replace(/^\{|\}$/g, '').replace(/\n/g, ' ').trim()

  const pairs = content.split(',').map(pair => pair.trim()).filter(Boolean)

  const parsedProperties = pairs.map((pair) => {
    const [key, ...valueParts] = pair.split(':')
    const value = valueParts.join(':').trim()

    if (value.startsWith('\'') || value.startsWith('"')) {
      // For string literals, keep as is
      return `  ${key.trim()}: ${value};`
    }
    else {
      // For other types, use preserveValueType
      const preservedValue = preserveValueType(value)
      return `  ${key.trim()}: ${preservedValue};`
    }
  })

  return `{\n${parsedProperties.join('\n')}\n}`
}

function processDeclaration(declaration: string): string {
  // Remove comments
  const declWithoutComments = declaration.replace(/\/\/.*$/gm, '').trim()
  const trimmed = declWithoutComments

  // Handle const declarations
  if (trimmed.startsWith('export const')) {
    const equalIndex = trimmed.indexOf('=')
    if (equalIndex === -1)
      return trimmed // No value assigned

    const name = trimmed.slice(0, equalIndex).trim()
    let value = trimmed.slice(equalIndex + 1).trim()

    // Handle multi-line object literals
    if (value.startsWith('{')) {
      const matchResult = value.match(/\{([^}]*)\}/)
      if (matchResult) {
        value = matchResult[0]
      }
    }

    if (value) {
      if (value.startsWith('{')) {
        // For object literals, preserve the exact structure
        const objectType = parseObjectLiteral(value)
        return `export declare const ${name.split(':')[0].replace('export const', '').trim()}: ${objectType};`
      }
      else {
        // For primitive values, use the exact value as the type
        const valueType = preserveValueType(value)
        return `export declare const ${name.split(':')[0].replace('export const', '').trim()}: ${valueType};`
      }
    }
    else {
      // If no value, default to 'any'
      return `export declare const ${name.split(':')[0].replace('export const', '').trim()}: any;`
    }
  }

  // Handle interface declarations
  if (trimmed.startsWith('export interface')) {
    return `export declare ${trimmed.slice('export'.length).trim()}`
  }

  // Handle type declarations
  if (trimmed.startsWith('export type')) {
    return `export declare ${trimmed.slice('export'.length).trim()}`
  }

  // Handle function declarations
  if (trimmed.startsWith('export function')) {
    const functionSignature = trimmed.split('{')[0].trim()
    return `export declare ${functionSignature.slice('export'.length).trim()};`
  }

  // Handle other declarations
  if (trimmed.startsWith('export')) {
    return trimmed.endsWith(';') ? trimmed : `${trimmed};`
  }

  return ''
}

function preserveValueType(value: string): string {
  value = value.trim()
  if (value === 'true' || value === 'false') {
    return value // Keep true and false as literal types
  }
  else if (!Number.isNaN(Number(value))) {
    return value // Keep numbers as literal types
  }
  else if (value.startsWith('[') && value.endsWith(']')) {
    return 'any[]' // Generic array type
  }
  else if ((value.startsWith('\'') && value.endsWith('\'')) || (value.startsWith('"') && value.endsWith('"'))) {
    return value // Keep string literals as is
  }
  else {
    return 'any' // Default to any for other cases
  }
}
