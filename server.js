import express from "express";
import fetch from "node-fetch";
import bodyParser from "body-parser";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(bodyParser.json());
app.use(express.static(__dirname)); // serve static files (index.html, callback)

let userToken = null;
let AD_ACCOUNT_ID = 3833310993548191;
let PAGE_ID = 619312814603108;

// Save token
app.get("/save-token", (req, res) => {
  userToken = req.query.token;
  console.log("🔐 Token saved:", userToken);
  res.send("Token received");
});

// Fetch Pages
app.get("/api/pages", async (req, res) => {
  if (!userToken) return res.json({ data: [] });
  const r = await fetch(`https://graph.facebook.com/v20.0/me/accounts?access_token=${userToken}`);
  const data = await r.json();
  if (data.data && data.data[0]) PAGE_ID = data.data[0].id;
  res.json(data);
});

// Fetch Ad Accounts
app.get("/api/adaccounts", async (req, res) => {
  if (!userToken) return res.json({ data: [] });
  const r = await fetch(`https://graph.facebook.com/v20.0/me/adaccounts?access_token=${userToken}`);
  const data = await r.json();
  if (data.data && data.data[0]) AD_ACCOUNT_ID = data.data[0].id;
  res.json(data);
});

// Create Campaign
app.post("/create-campaign", async (req, res) => {
  if (!userToken || !AD_ACCOUNT_ID) return res.status(400).json({ error: "No token or ad account" });

  const { brief } = req.body;
  const payload = new URLSearchParams();
  payload.append("name", `CrewAI - ${brief.substring(0, 30)}`);
  payload.append("objective", "OUTCOME_TRAFFIC");
  payload.append("status", "PAUSED");
  payload.append("special_ad_categories", "NONE");
  payload.append("access_token", userToken);

  const r = await fetch(`https://graph.facebook.com/v20.0/${AD_ACCOUNT_ID}/campaigns`, {
    method: "POST",
    body: payload,
  });
  const result = await r.json();
  res.json({ payload: { name: payload.get("name") }, result });
});

// ✅ Helper: Get Page Access Token
async function getPageAccessToken(pageId, userToken) {
  const r = await fetch(`https://graph.facebook.com/v20.0/${pageId}?fields=access_token&access_token=${userToken}`);
  const data = await r.json();
  return data.access_token;
}

// ✅ Fetch Leads
app.get("/api/leads", async (req, res) => {
  if (!userToken || !PAGE_ID) return res.json({ data: [] });

  try {
    const pageAccessToken = await getPageAccessToken(PAGE_ID, userToken);
    if (!pageAccessToken) return res.json({ error: "Could not get page access token" });

    const r = await fetch(`https://graph.facebook.com/v20.0/${PAGE_ID}/leadgen_forms?access_token=${pageAccessToken}`);
    const forms = await r.json();

    let allLeads = [];
    if (forms.data && forms.data.length > 0) {
      for (const form of forms.data) {
        const leadsRes = await fetch(`https://graph.facebook.com/v20.0/${form.id}/leads?access_token=${pageAccessToken}`);
        const leadsData = await leadsRes.json();
        if (leadsData.data) {
          allLeads.push({
            form_id: form.id,
            form_name: form.name,
            leads: leadsData.data
          });
        }
      }
    }

    res.json({ forms, allLeads });

  } catch (err) {
    console.error("Lead fetch error:", err);
    res.json({ error: err.message });
  }
});


// ✅ NEW: Fetch Ad Insights (ads_read)
// ✅ Fetch Ads Data (with campaign & ad names)
// ✅ Fetch Top 5 Latest Ads (with campaign & performance)
app.get("/api/ads", async (req, res) => {
  if (!userToken || !AD_ACCOUNT_ID) return res.json({ data: [] });

  try {
    // 1️⃣ Fetch the 5 most recent ads (active or recently updated)
    const r = await fetch(
      `https://graph.facebook.com/v20.0/${AD_ACCOUNT_ID}/ads?fields=name,campaign{name},created_time,insights{impressions,clicks,ctr,spend}&limit=5&access_token=${userToken}`
    );
    const data = await r.json();

    // 2️⃣ Simplify for frontend display
    const formatted = (data.data || []).map(ad => ({
      campaign: ad.campaign?.name || "-",
      ad_name: ad.name || "-",
      impressions: ad.insights?.data?.[0]?.impressions || 0,
      clicks: ad.insights?.data?.[0]?.clicks || 0,
      ctr: ad.insights?.data?.[0]?.ctr || 0,
      spend: ad.insights?.data?.[0]?.spend || 0,
      created_time: ad.created_time || "-"
    }));

    // 3️⃣ Sort newest first
    formatted.sort((a, b) => new Date(b.created_time) - new Date(a.created_time));

    res.json({ data: formatted.slice(0, 5) }); // only top 5
  } catch (err) {
    console.error("Ad fetch error:", err);
    res.json({ error: err.message });
  }
});



app.listen(3000, () => console.log("🚀 Running on http://localhost:3000"));
