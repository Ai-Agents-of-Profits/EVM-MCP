import { ethers } from 'ethers';
import fs from 'fs';
import readline from 'readline';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create readline interface for secure password input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Path to your wallet file
const walletFile = process.argv[2] || path.join(__dirname, 'keys', '0x95723432b6a145b658995881b0576d1e16850b02.json');

if (!fs.existsSync(walletFile)) {
  console.error(`Error: Wallet file ${walletFile} does not exist`);
  process.exit(1);
}

async function decryptWallet() {
  try {
    // Read the encrypted wallet data
    const walletData = JSON.parse(fs.readFileSync(walletFile, 'utf8'));
    
    if (!walletData.encrypted || !walletData.encryptedData) {
      console.error('Error: Wallet is not encrypted or encryptedData is missing');
      process.exit(1);
    }
    
    // Ask for password securely
    rl.question('Enter password to decrypt wallet: ', async (password) => {
      try {
        // Decrypt the wallet using the encrypted data
        const wallet = await ethers.Wallet.fromEncryptedJson(walletData.encryptedData, password);
        
        console.log('\n========== PRIVATE KEY (SENSITIVE INFORMATION) ==========');
        console.log(wallet.privateKey);
        console.log('==========================================================');
        console.log('\nWARNING: Your private key has been displayed. Make sure no one is looking at your screen.');
        console.log('WARNING: This information grants full access to your funds. Never share it with anyone.\n');
        
        // Clear console after 30 seconds for security
        console.log('Console will clear in 30 seconds for security...');
        setTimeout(() => {
          console.clear();
          console.log('Console cleared for security.');
          process.exit(0);
        }, 30000);
      } catch (error) {
        console.error('Error decrypting wallet:', error.message);
        console.log('Possible causes: incorrect password or corrupted wallet file');
        process.exit(1);
      } finally {
        rl.close();
      }
    });
  } catch (error) {
    console.error('Error reading wallet file:', error.message);
    process.exit(1);
  }
}

console.log(`Attempting to decrypt wallet at: ${walletFile}`);
console.log('WARNING: Only proceed if you are in a secure environment with no one watching your screen\n');

decryptWallet();
