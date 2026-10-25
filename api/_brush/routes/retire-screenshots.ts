import { driveFileAccess, moveToDriveTrash } from '../drive.js'
import { json } from '../http.js'

const FILES = [
  { name: 'Screenshot_20261021_084359_Gallery.jpg', id: '1z1-DsbeHoQjSr0Tkqe3T7CblwbJUclvZ' },
  { name: 'Screenshot_20261021_084414_Gallery.jpg', id: '1egdQjawAMH35abDhXFoE8xr0aJpL6rzx' },
  { name: 'Screenshot_20261021_085239_ChatGPT.jpg', id: '1PRHMf4MAB4KjalSkkPjO3M9ryojtUxoT' },
  { name: 'Screenshot_20261021_085243_ChatGPT.jpg', id: '1dRfB_afndFnbCvvnDe8Oh__gYWqv15x_' },
  { name: 'Screenshot_20261021_085246_ChatGPT.jpg', id: '1Om75TDd7TZLvyDygQe5YPq5LeqnZo2IS' },
  { name: 'Screenshot_20261021_085251_ChatGPT.jpg', id: '1PbW_mmim9TSceEy0RrjHc_AHJTe4Ex4F' },
  { name: 'Screenshot_20261023_131245_ChatGPT.jpg', id: '1oGOo4CbSI95daLKpYEjGmaD_jpB9K2JU' },
  { name: 'Screenshot_20261023_015200_TikTok.jpg', id: '1sO6_5H1S_P7vdZBWxj_PXPZue6LpOiIZ' },
  { name: 'Screenshot_20261023_015204_TikTok.jpg', id: '12G2uDJIPyAiaXvvo8rKmjHQRJP__8ZNA' },
  { name: 'Screenshot_20261023_015214_TikTok.jpg', id: '1w3qX1H5cdo-uKjv2QnYd71cpCcuAgaKw' },
]

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return false
  return request.headers.get('authorization') === `Bearer ${secret}`
}

export default {
  async fetch(request: Request) {
    if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)
    if (!authorized(request)) return json({ error: 'Not found.' }, 404)
    const trashed: string[] = []
    const failed: { name: string, error: string }[] = []
    for (const file of FILES) {
      try {
        await moveToDriveTrash(file.id)
        trashed.push(file.name)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Drive trash failed.'
        let access = 'unknown'
        try {
          const info = await driveFileAccess(file.id)
          access = `canTrash=${info.canTrash} canEdit=${info.canEdit} trashed=${info.trashed}`
        } catch {
          access = 'unreadable'
        }
        failed.push({ name: file.name, error: `${message.slice(0, 120)} ${access}` })
      }
    }
    return json({ trashed, failed })
  },
}
