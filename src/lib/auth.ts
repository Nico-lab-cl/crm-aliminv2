import { NextAuthOptions, DefaultSession } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import CredentialsProvider from "next-auth/providers/credentials";
import prisma from "@/lib/prisma";
import { Adapter } from "next-auth/adapters";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
    } & DefaultSession["user"];
  }

  interface User {
    id?: string;
    role: string;
  }
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as Adapter,
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Usuario", type: "text" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null;

        try {
          const user = await (prisma as any).user.findUnique({
            where: { username: credentials.username },
            select: {
              id: true,
              username: true,
              password: true,
              name: true,
              role: true,
              // We omit image and phone here to avoid crashes if columns are missing
            }
          });

          if (!user || user.password !== credentials.password) {
            return null;
          }

          return {
            id: user.id,
            username: user.username,
            name: user.name,
            image: user.image,
            role: user.role,
            phone: user.phone,
          } as any;
        } catch (error) {
          console.error("Auth: Database error during authorize", error);
          return null;
        }
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = (user as any).id;
        token.username = (user as any).username;
        token.role = (user as any).role;
        token.phone = (user as any).phone;
        token.image = (user as any).image;
      }
      
      // Update token if session is updated manually
      if (trigger === "update" && session) {
        token.name = session.name;
        token.phone = session.phone;
        token.image = session.image;
      }
      
      return token;
    },
    async session({ session, token }) {
      if (token) {
        (session.user as any).id = token.id;
        (session.user as any).username = token.username;
        (session.user as any).role = token.role;
        (session.user as any).phone = token.phone;
        (session.user as any).image = token.image;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
};
