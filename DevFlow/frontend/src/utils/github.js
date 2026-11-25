// Turns whatever the user typed into a clean https://github.com/owner/repo URL.
// Accepts: owner/repo, github.com/owner/repo, full URLs, .git endings, /tree/main/... suffixes, ?query and #hash.

const OWNER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/
const REPO_PATTERN = /^[A-Za-z0-9._-]{1,100}$/

export function parseRepoInput(raw) {
  let text = (raw || '').trim()

  if (!text) {
    return { error: 'Enter a GitHub repository URL, like https://github.com/owner/repo' }
  }

  text = text.replace(/^https?:\/\//i, '').replace(/^www\./i, '')
  text = text.split(/[?#]/)[0]

  const segments = text.split('/').filter(Boolean)

  // GitHub usernames cannot contain dots, so a dot in the first part means a website name.
  if (segments[0] && segments[0].includes('.')) {
    if (segments[0].toLowerCase() !== 'github.com') {
      return { error: 'Only github.com repositories are supported.' }
    }
    segments.shift()
  }

  if (segments.length < 2) {
    return { error: 'That link needs an owner and a repository, like https://github.com/owner/repo' }
  }

  const owner = segments[0]
  const repo = segments[1].replace(/\.git$/i, '')

  if (!OWNER_PATTERN.test(owner) || !REPO_PATTERN.test(repo) || repo === '.' || repo === '..') {
    return { error: 'That does not look like a valid GitHub repository name.' }
  }

  return { url: `https://github.com/${owner}/${repo}`, fullName: `${owner}/${repo}` }
}

// Plain-English messages for when the backend sends an error without a useful message.
export function friendlyStatus(status) {
  if (status === 404) {
    return 'Repository not found. Check the spelling. Private repositories are not supported.'
  }
  if (status === 403 || status === 429) {
    return 'GitHub rate limit reached. Wait a few minutes, or add a GitHub token to the backend .env file.'
  }
  if (status === 400 || status === 422) {
    return 'The backend could not read that link. Use the form https://github.com/owner/repo'
  }
  if (status >= 500) {
    return 'The backend hit an internal error. Check the backend terminal for details.'
  }
  return 'Something went wrong while analyzing this repository.'
}