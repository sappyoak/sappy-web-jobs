import { CosmosClient } from "@azure/cosmos";

export function createCosmosClient(endpoint = process.env.COSMOS_DB_ENDPOINT, key = process.env.COSMOS_DB_KEY) {
    return new CosmosClient({ endpoint, key })
}

export async function addFeedItem(feedData) {
    try {
        const client = createCosmosClient()
        const { database } = await client.databases.createIfNotExists({
            id: process.env.COSMOS_DB_ID
        })
        const { container } = await database.containers.createIfNotExists({
            id: process.env.COSMOS_FEED_CONTAINER
        })

        await container.items.create(feedData)
        return { msg: '', success: true }
    } catch (error) {
        return { msg: error?.message, success: false }
    }
}