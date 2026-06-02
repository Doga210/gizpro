8852595321:AAF0M9YS3HoETbcGlDQqwSlqQE_cRJ7bZA0from telegram import Update
from telegram.ext import ApplicationBuilder, CommandHandler, ContextTypes

TOKEN = "ضع_توكنك_هنا"  # ← انسخ التوكن من token.txt يدوياً

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("✅ البوت يعمل!")

app = ApplicationBuilder().token(TOKEN).build()
app.add_handler(CommandHandler("start", start))
print("🚀 البوت يعمل...")
app.run_polling()
