import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { supabase } from "../lib/supabase";
import { verifyToken } from "../middleware/auth";

const router = Router();

// POST /api/auth/register
router.post("/register", async (req: Request, res: Response): Promise<void> => {
  const { name, email, password, country } = req.body;

  if (!name || typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  if (!email || typeof email !== "string" || !email.trim()) {
    res.status(400).json({ error: "email is required" });
    return;
  }
  if (!password || typeof password !== "string" || password.length < 1) {
    res.status(400).json({ error: "password is required" });
    return;
  }

  const password_hash = await bcrypt.hash(password, 10);

  const { data, error } = await supabase
    .from("artists")
    .insert({ name: name.trim(), email: email.trim().toLowerCase(), password_hash, country: country ?? null })
    .select("id, name, email, country, created_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      res.status(409).json({ error: "Email already registered" });
      return;
    }
    res.status(500).json({ error: `Registration failed: ${error.message}` });
    return;
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    res.status(500).json({ error: "JWT_SECRET not configured" });
    return;
  }

  const token = jwt.sign({ artist_id: data.id, email: data.email }, secret, { expiresIn: "7d" });

  res.json({ artist_id: data.id, name: data.name, email: data.email, token });
});

// POST /api/auth/login
router.post("/login", async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: "email and password are required" });
    return;
  }

  const { data: artist } = await supabase
    .from("artists")
    .select("id, name, email, password_hash, country")
    .eq("email", email.trim().toLowerCase())
    .maybeSingle();

  if (!artist) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const valid = await bcrypt.compare(password, artist.password_hash);
  if (!valid) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    res.status(500).json({ error: "JWT_SECRET not configured" });
    return;
  }

  const token = jwt.sign({ artist_id: artist.id, email: artist.email }, secret, { expiresIn: "7d" });

  res.json({ artist_id: artist.id, name: artist.name, email: artist.email, token });
});

// GET /api/auth/me
router.get("/me", verifyToken, async (req: Request, res: Response): Promise<void> => {
  const { data: artist } = await supabase
    .from("artists")
    .select("id, name, email, country, created_at")
    .eq("id", req.artist!.artist_id)
    .maybeSingle();

  if (!artist) {
    res.status(401).json({ error: "Artist not found" });
    return;
  }

  res.json({ artist_id: artist.id, name: artist.name, email: artist.email, country: artist.country, created_at: artist.created_at });
});

export default router;
