from telegram import Update
from telegram.ext import ApplicationBuilder, CommandHandler, ContextTypes

with open("token.txt", "r") as f:
    TOKEN = f.read().strip()

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("✅ البوت يعمل!")

app = ApplicationBuilder().token(TOKEN).build()
app.add_handler(CommandHandler("start", start))
print("🚀 اختبار...")
app.run_polling()
