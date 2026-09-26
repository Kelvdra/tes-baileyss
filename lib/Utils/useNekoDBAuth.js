import { proto } from '../../WAProto/index.js'
import { initAuthCreds } from './auth-utils.js'
import { BufferJSON } from './generics.js'
import defaultLogger from './logger.js'

export async function useNekoDBAuth(db, collectionName = 'baileys_kelvdra_auth', logger = defaultLogger) {
    if (!db || typeof db.collection !== 'function') {
        throw new Error(
            'useNekoDBAuth: argumen pertama harus instance NekoDB yang terkoneksi'
        )
    }

    const col = db.collection(collectionName).helper()

    const writeData = async (data, key) => {
        const value = JSON.stringify(data, BufferJSON.replacer)

        await col.upsert(
            { k: key },
            {
                k: key,
                v: value
            }
        )
    }

    const readData = async key => {
        try {
            const doc = await col.findOne({ k: key })

            if (!doc || doc.v == null) {
                return null
            }

            return JSON.parse(doc.v, BufferJSON.reviver)
        } catch (error) {
            // No "not found" case reaches this catch (that's handled above via
            // findOne returning null) - anything caught here is a real DB/parse error.
            logger.warn({ err: error, key }, 'failed to read auth data from NekoDB')
            return null
        }
    }

    const removeData = async key => {
        try {
            await col.deleteWhere({ k: key })
        } catch (error) {
            logger.warn({ err: error, key }, 'failed to remove auth data from NekoDB')
        }
    }

    const creds =
        (await readData('creds')) ||
        initAuthCreds()

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {}

                    await Promise.all(
                        ids.map(async id => {
                            let value = await readData(`${type}-${id}`)

                            if (
                                type === 'app-state-sync-key' &&
                                value
                            ) {
                                value =
                                    proto.Message.AppStateSyncKeyData.fromObject(
                                        value
                                    )
                            }

                            data[id] = value
                        })
                    )

                    return data
                },

                set: async data => {
                    const tasks = []

                    for (const category in data) {
                        const entries = data[category]

                        for (const id in entries) {
                            const value = entries[id]
                            const key = `${category}-${id}`

                            tasks.push(
                                value
                                    ? writeData(value, key)
                                    : removeData(key)
                            )
                        }
                    }

                    await Promise.all(tasks)
                }
            }
        },

        saveCreds: async () => {
            await writeData(creds, 'creds')
        },

        clearAuth: async () => {
            try {
                await db.deleteCollection(collectionName)
            } catch (error) {
                logger.warn({ err: error, collectionName }, 'failed to clear NekoDB auth collection')
            }
        }
    }
}
