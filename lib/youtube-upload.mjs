// youtube-upload.mjs — builds + validates a YouTube Data API `videos.insert` request
// from a publish package. It deliberately does NOT perform the upload: that needs the
// operator's OAuth credentials and consent (an outward-facing, account-mutating action).
// This module produces the exact request body so the publish step is a credential away,
// and validates it against YouTube's field limits so a bad upload can't be attempted.
//
// Zero dependencies (no googleapis) — the core stays dependency-free; the skill shows
// how to drive the actual upload with the operator's authenticated client.

// YouTube Data API limits (videos.insert).
export const YT_LIMITS = Object.freeze({ titleMax: 100, descriptionMax: 5000, tagsCharMax: 500 })
// A few common category ids; Education is the default for explainer channels.
export const YT_CATEGORIES = Object.freeze({ education: '27', scienceTech: '28', howto: '26', entertainment: '24', news: '25' })
export const PRIVACY = Object.freeze(['private', 'unlisted', 'public'])

/**
 * Build the videos.insert request from a publish package.
 *   buildInsertRequest(pkg, { privacyStatus, categoryId, publishAtUtc, madeForKids,
 *                             syntheticMediaDisclosed, defaultLanguage })
 * Returns { part, requestBody, mediaHint, disclosures }. `requestBody.status.publishAt`
 * is set only for a scheduled (privacyStatus:'private' + publishAt) upload.
 */
export function buildInsertRequest(pkg, opts = {}) {
  if (!pkg || !pkg.title) throw new Error('buildInsertRequest: publish package with a title required')
  const {
    privacyStatus = 'private', // safe default — never auto-publish public
    categoryId = YT_CATEGORIES.education,
    publishAtUtc = null,
    madeForKids = false,
    syntheticMediaDisclosed = (pkg.disclosures || []).some((d) => /synthetic|ai/i.test(d)),
    defaultLanguage = 'en',
  } = opts

  const status = { privacyStatus, selfDeclaredMadeForKids: madeForKids, embeddable: true }
  if (publishAtUtc) {
    // Scheduling requires the video to be uploaded private with a future publishAt.
    status.privacyStatus = 'private'
    status.publishAt = publishAtUtc
  }

  return {
    part: ['snippet', 'status'],
    requestBody: {
      snippet: {
        title: pkg.title,
        description: pkg.description || '',
        tags: pkg.tags || [],
        categoryId,
        defaultLanguage,
      },
      status,
    },
    // YouTube's "altered/synthetic content" disclosure is a Studio/account-level flag
    // the API can't always set — surface it so the operator sets it at upload.
    disclosures: { syntheticMediaDisclosed, note: syntheticMediaDisclosed ? 'Set the "altered content / synthetic media" disclosure in Studio at upload.' : null },
    mediaHint: 'attach the rendered MP4 as the resumable upload media body',
  }
}

/** Validate an insert request against YouTube's limits + enum constraints. */
export function validateInsertRequest(req) {
  const issues = []
  const sn = req?.requestBody?.snippet || {}
  const st = req?.requestBody?.status || {}
  if (!sn.title) issues.push('missing title')
  if ((sn.title || '').length > YT_LIMITS.titleMax) issues.push(`title > ${YT_LIMITS.titleMax} chars`)
  if ((sn.description || '').length > YT_LIMITS.descriptionMax) issues.push(`description > ${YT_LIMITS.descriptionMax} chars`)
  const tagChars = (sn.tags || []).join('').length
  if (tagChars > YT_LIMITS.tagsCharMax) issues.push(`tags > ${YT_LIMITS.tagsCharMax} chars`)
  if (!PRIVACY.includes(st.privacyStatus)) issues.push(`privacyStatus must be one of ${PRIVACY.join('|')}`)
  if (st.publishAt && st.privacyStatus !== 'private') issues.push('scheduled upload (publishAt) requires privacyStatus "private"')
  return { valid: issues.length === 0, issues }
}
