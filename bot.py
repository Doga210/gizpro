from telegram import Update
from telegram.ext import ApplicationBuilder, CommandHandler, ContextTypes
import subprocess

# قراءة التوكن من الملف
with open("token.txt", "r") as f:
    TOKEN = f.read().strip()

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "🤖 بوت GizPro جاهز!\n\n"
        "/balance — عرض الرصيد\n"
        "/address — عرض العنوان\n"
        "/info — معلومات المحفظة"
    )

async def balance(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("⏳ جاري التحقق...")
    try:
        result = subprocess.run(
            ["node", "app.js", "balance"],
            capture_output=True, text=True, timeout=30
        )
        output = result.stdout if result.stdout else "✅ تم"
        await update.message.reply_text(output[:4000])
    except Exception as e:
        await update.message.reply_text(f"❌ خطأ: {str(e)}")

async def address(update: Update, context: ContextTypes.DEFAULT_TYPE):
    try:
        result = subprocess.run(
            ["node", "app.js", "address"],
            capture_output=True, text=True, timeout=30
        )
        await update.message.reply_text(f"📍 {result.stdout[:4000]}")
    except Exception as e:
        await update.message.reply_text(f"❌ خطأ: {str(e)}")

async def info(update: Update, context: ContextTypes.DEFAULT_TYPE):
    try:
        result = subprocess.run(
            ["node", "app.js", "info"],
            capture_output=True, text=True, timeout=30
        )
        await update.message.reply_text(f"📊 {result.stdout[:4000]}")
    except Exception as e:
        await update.message.reply_text(f"❌ خطأ: {str(e)}")

app = ApplicationBuilder().token(TOKEN).build()
app.add_handler(CommandHandler("start", start))
app.add_handler(CommandHandler("balance", balance))
app.add_handler(CommandHandler("address", address))
app.add_handler(CommandHandler("info", info))

print("🚀 البوت يعمل...")
app.run_polling()
