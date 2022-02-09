import { AzureFunction, Context, HttpRequest } from '@azure/functions'
import { createHmac, timingSafeEqual } from 'crypto'

import { addFeedItem } from '../lib/db'

interface GithubActivityItem {
    event: string
    isFork: boolean
    isPrivate: boolean
    repo: string
    url: string
    description: string
    organization?: {
        name: string,
        url: string
    }
    refType?: string
}

const feedTigger: AzureFunction = async function (context: Context, request: HttpRequest): Promise<void> {
    context.log.info(`Processing request...`)

    const hashSignatureHeader = request.headers['X-Hub-Signature-256']
    const eventName = request.headers['X-GitHub-Event']

    if (!hashSignatureHeader) {
        context.log.error(`Received Github webhook without proper hash header`)
        context.res = { status: 403 }
        return
    }

    const signature = Buffer.from(hashSignatureHeader, 'utf8')
    const hmac = createHmac('sha256', process.env.GITHUB_WEBHOOK_SECRET)
    const digest = Buffer.from(`sha256=${hmac.update(JSON.stringify(request.body)).digest('hex')}`, 'utf8')

    if (signature.length !== digest.length || !timingSafeEqual(digest, signature)) {
        context.log.error(`Request body digest did not match the signature header`)
        context.res = { status: 403 }
        return
    }

    const activityItem = createGithubActivityItem(eventName, request.body)
    
    if (!activityItem) {
        context.log.info(`Activity triggered by non-relevant sender`)
        context.res = { status: 304 }
        return
    }

    const feedItem = {
        type: `github-${activityItem.event}`,
        url: activityItem.url,
        description: activityItem.description,
        meta: {
            isFork: activityItem.isFork,
            isPrivate: activityItem.isPrivate,
            repo: activityItem.repo,
            organization: activityItem.organization,
            refType: activityItem.refType
        }
    }

    const response = await addFeedItem(feedItem)
    if (response.success) {
        context.res = { status: 200 }
        return
    }

    context.log.error(`Unable to add feed item to db: ${response.msg}`)
    context.res = { status: 500 }
    return
}


function createGithubActivityItem(eventName, payload): GithubActivityItem {    
    const { repository, sender } = payload

    if (sender.login !== process.env.GITHUB_USERNAME) {
        return null
    }

    const infoItem: GithubActivityItem = {
        event: eventName,
        isFork: repository.fork,
        isPrivate: repository.private,
        repo: repository.full_name,
        url: repository.html_url,
        description: repository.description
    }

    if (payload.organization) {
        infoItem.organization = {
            name: payload.organization.login,
            url: payload.organization.url
        }
    }

    if (payload.ref_type) {
        infoItem.refType = payload.ref_type
    }

    if (payload.discussion && !payload.comment) {
        infoItem.url = payload.discussion.html_url
    } else if (payload.comment) {
        infoItem.url = payload.comment.html_url
    }

    if (payload.issue) {
        infoItem.url = payload.issue.html_url
    }

    return infoItem
}