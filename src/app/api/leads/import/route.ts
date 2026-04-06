import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import csv from "csv-parser";
import prisma from "@/lib/prisma";

export async function POST(req: Request): Promise<NextResponse> {
  const { filePath } = await req.json();

  if (!filePath) {
    return NextResponse.json({ error: "File path is required" }, { status: 400 });
  }

  const results: any[] = [];

  try {
    const data: any[] = await new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on("data", (data) => results.push(data))
        .on("error", (error) => reject(error))
        .on("end", () => resolve(results));
    });

    const importedLeads = await Promise.all(
      data.map((row) => {
        return prisma.lead.create({
          data: {
            firstName: row["First Name"] || row["Nombre"],
            lastName: row["Last Name"] || row["Apellido"],
            phone: row["Phone"] || row["Teléfono"],
            email: row["Email"] || row["Correo"],
            source: "CSV Import",
            status: "NUEVO",
          },
        });
      })
    );

    return NextResponse.json({ message: `Imported ${importedLeads.length} leads` });
  } catch (error) {
    console.error("Import error:", error);
    return NextResponse.json({ error: "Import failed" }, { status: 500 });
  }
}
