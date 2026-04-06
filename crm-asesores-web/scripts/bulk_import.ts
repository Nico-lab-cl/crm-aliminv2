import { PrismaClient } from '@prisma/client'
import fs from 'fs'
import csv from 'csv-parser'
import path from 'path'

const prisma = new PrismaClient()

async function importLeads(filePath: string, advisorUsername: string) {
  console.log(`Importing leads for ${advisorUsername} from ${filePath}...`)
  
  const advisor = await prisma.user.findUnique({
    where: { username: advisorUsername }
  })

  if (!advisor) {
    console.error(`Error: Advisor with username ${advisorUsername} not found.`)
    return
  }

  const results: any[] = []

  return new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', async () => {
        try {
          for (const row of results) {
            await prisma.lead.create({
              data: {
                contactId: row['Contact Id'],
                firstName: row['First Name'],
                lastName: row['Last Name'],
                phone: row['Phone'],
                email: row['Email'],
                businessName: row['Business Name'],
                tags: row['Tags'],
                lastActivity: row['Last Activity'],
                source: 'CSV Import',
                assignedToId: advisor.id
              }
            })
          }
          console.log(`Successfully imported ${results.length} leads for ${advisorUsername}`)
          resolve(true)
        } catch (error) {
          console.error(`Error importing leads for ${advisorUsername}:`, error)
          reject(error)
        }
      })
  })
}

async function main() {
  const files = [
    { path: 'c:\\Users\\pc\\OneDrive\\Desktop\\CRM-Alimin\\Export_Contacts_Barbara A_Mar_2026_11_15_AM.csv', advisor: 'Barbara.a@aliminspa.cl' },
    { path: 'c:\\Users\\pc\\OneDrive\\Desktop\\CRM-Alimin\\Export_Contacts_Marcela E_Mar_2026_11_15_AM.csv', advisor: 'marcela.e@aliminspa.cl' },
    { path: 'c:\\Users\\pc\\OneDrive\\Desktop\\CRM-Alimin\\Export_Contacts_Orlando_Mar_2026_11_15_AM.csv', advisor: 'Orlando.c@aliminspa.cl' }
  ]

  for (const file of files) {
    if (fs.existsSync(file.path)) {
      await importLeads(file.path, file.advisor)
    } else {
      console.warn(`File not found: ${file.path}`)
    }
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
