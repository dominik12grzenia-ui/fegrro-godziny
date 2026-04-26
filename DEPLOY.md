# Instrukcja Deploy — FeGrro Godziny

## Krok 1: MongoDB Atlas ✅ DONE
- Cluster: cluster0.ckrpzlh.mongodb.net
- User: fegrro / FeGrro2026db
- Network: 0.0.0.0/0

## Krok 2: Backend na Render.com (darmowy)

1. Wejdź na **[render.com](https://render.com)** → załóż konto (przez GitHub)
2. Kliknij **"New +"** → **"Web Service"**
3. Połącz z GitHub → wybierz repo **fegrro-godziny**
4. Ustawienia:
   - **Name**: `fegrro-backend`
   - **Root Directory**: `backend`
   - **Runtime**: `Python`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn server:app --host 0.0.0.0 --port $PORT`
   - **Plan**: Free
5. Dodaj **Environment Variables** (kliknij "Advanced" → "Add Environment Variable"):

```
MONGO_URL = mongodb+srv://fegrro:FeGrro2026db@cluster0.ckrpzlh.mongodb.net/?appName=Cluster0
DB_NAME = fegrro_db
JWT_SECRET = fegrro-jwt-secret-2026-change-me
ADMIN_EMAIL = admin@fegrro.pl
ADMIN_PASSWORD = Admin123!
CORS_ORIGINS = https://godziny.fegrro.pl
AZURE_CLIENT_ID = (skopiuj z .env)
AZURE_TENANT_ID = ec17bf76-6ca2-4d2e-8643-a9be27e9a7e3
AZURE_CLIENT_SECRET = (skopiuj z .env)
ONEDRIVE_EXCEL_FILE = Wypłaty  główny.xlsx
ONEDRIVE_FILE_PATH = 3. Finanse firmowe/Bilans 2026/Wypłaty  główny.xlsx
ONEDRIVE_ARCHIVE_FOLDER = Archiwizacja
GOOGLE_MAPS_API_KEY = (skopiuj z .env)
```

6. Kliknij **"Create Web Service"**
7. Poczekaj ~5 minut → dostaniesz URL np. `https://fegrro-backend.onrender.com`

## Krok 3: Frontend na Vercel.com (darmowy)

1. Wejdź na **[vercel.com](https://vercel.com)** → zaloguj się przez GitHub
2. Kliknij **"Add New..."** → **"Project"**
3. Importuj repo **fegrro-godziny**
4. Ustawienia:
   - **Framework Preset**: `Create React App`
   - **Root Directory**: `frontend`
5. Dodaj **Environment Variable**:
```
REACT_APP_BACKEND_URL = https://fegrro-backend.onrender.com
```
   (zamień na prawdziwy URL z kroku 2)
6. Kliknij **"Deploy"**
7. Dostaniesz URL np. `https://fegrro-godziny.vercel.app`

## Krok 4: Domena godziny.fegrro.pl

### Na Vercel:
1. W projekcie → **Settings** → **Domains**
2. Wpisz: `godziny.fegrro.pl`
3. Vercel poda Ci rekord DNS do dodania

### U rejestratora domeny (fegrro.pl):
1. Dodaj rekord **CNAME**:
   - Nazwa: `godziny`
   - Wartość: `cname.vercel-dns.com`
2. Poczekaj ~15 minut na propagację DNS

## WAŻNE: Po deployu backend na Render
Wróć do Vercel i zaktualizuj REACT_APP_BACKEND_URL na prawdziwy adres Render.
Potem wróć do Render i dodaj domenę Vercel do CORS_ORIGINS.
