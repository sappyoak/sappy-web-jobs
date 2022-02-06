import { AzureFunction, Context, HttpRequest } from '@azure/functions'
import { createHmac, timingSafeEqual } from 'crypto'

const feedTigger: AzureFunction = async function (context: Context, request: HttpRequest): Promise<void> {
    context.log(`Processing request...`)

    const hashSignatureHeader = request.headers['X-Hub-Signature-256']
    if (!hashSignatureHeader) {
        context.log(`Received Github webhook without proper hash header`)
        // response
        return
    }

    const signature = Buffer.from(hashSignatureHeader, 'utf8')
    const hmac = createHmac('sha256', process.env.GITHUB_WEBHOOK_SECRET)
    const digest = Buffer.from(`sha256=${hmac.update(JSON.stringify(request.body)).digest('hex')}`, 'utf8')

    if (signature.length !== digest.length || !timingSafeEqual(digest, signature)) {
        context.log(`Request body digest did not match the signature header`)
        return
    }

    const githubInfoItem = createGithubInfoItem(request.body)
    return null
}


function createGithubInfoItem({ hook, repository, sender }) {
    return {
        hookType: hook.type,
        isFork: repository.fork,
        isPrivate: repository.private,
        repo: repository.full_name,
        url: repository.html_url,
        description: repository.description,
    }
}