// blockchain.js
const SHA256 = require('crypto-js/sha256');

class Block {
    constructor(index, timestamp, transactions, previousHash = '') {
        this.index = index;
        this.timestamp = timestamp;
        // Transactions now contain more detail: { voterId, eventId, candidateId, timestamp }
        this.transactions = transactions;
        this.previousHash = previousHash;
        this.hash = this.calculateHash();
        this.nonce = 0; // Added for potential future PoW, though not used for mining here
    }

    calculateHash() {
        return SHA256(
            this.index +
            this.previousHash +
            this.timestamp +
            JSON.stringify(this.transactions) +
            this.nonce // Include nonce in hash calculation
        ).toString();
    }

    // Basic proof-of-work concept placeholder (not fully implemented/enforced)
    mineBlock(difficulty) {
        // Simple example: Find a hash starting with a certain number of zeros
        // This is computationally intensive and NOT done in this simple server.
        // It's just here to show where it *would* go in a real PoW chain.
        // while (this.hash.substring(0, difficulty) !== Array(difficulty + 1).join("0")) {
        //     this.nonce++;
        //     this.hash = this.calculateHash();
        // }
        // console.log("BLOCK MINED: " + this.hash);
        // In our case, we just calculate the hash once.
        this.hash = this.calculateHash();
    }
}

class Blockchain {
    constructor() {
        this.chain = [this.createGenesisBlock()];
        this.difficulty = 1; // Placeholder for potential mining
        // NOTE: No pending transactions buffer in this simplified version.
    }

    createGenesisBlock() {
        return new Block(0, new Date().toISOString(), "Genesis Block", "0");
    }

    getLatestBlock() {
        return this.chain[this.chain.length - 1];
    }

    addVote(voteTransaction) {
        // voteTransaction expected structure: { userId, eventId, candidateId, timestamp }
        const previousHash = this.getLatestBlock().hash;
        const newIndex = this.chain.length;
        const newTimestamp = new Date().toISOString(); // Timestamp of block creation

        // Create a new block containing this single vote transaction
        // In a real system, you'd batch transactions.
        const newBlock = new Block(newIndex, newTimestamp, [voteTransaction], previousHash);

        // newBlock.mineBlock(this.difficulty); // Placeholder for mining

        this.chain.push(newBlock);
        console.log('Block added:', newBlock.index, 'Hash:', newBlock.hash);
        return newBlock; // Return the newly added block
    }

    getVoteCounts(eventId) {
        const voteCounts = {};
        // Iterate through the entire chain (skip Genesis Block)
        for (let i = 1; i < this.chain.length; i++) {
            const block = this.chain[i];
            // Iterate through transactions in the block
            for (const transaction of block.transactions) {
                // Check if it's a valid vote transaction AND matches the requested eventId
                if (transaction && transaction.candidateId && transaction.eventId === eventId) {
                    const candidate = transaction.candidateId; // Assuming candidateId is what we count
                    voteCounts[candidate] = (voteCounts[candidate] || 0) + 1;
                }
            }
        }
        console.log(`Calculated vote counts for event ${eventId}:`, voteCounts);
        return voteCounts;
    }

    // Basic chain validation (can be expanded)
    isChainValid() {
        for (let i = 1; i < this.chain.length; i++) {
            const currentBlock = this.chain[i];
            const previousBlock = this.chain[i - 1];

            // Recalculate hash and check stored hash
            if (currentBlock.hash !== currentBlock.calculateHash()) {
                console.error(`Data Tampering Detected: Invalid hash for block ${currentBlock.index}`);
                return false;
            }

            // Check if blocks are linked correctly
            if (currentBlock.previousHash !== previousBlock.hash) {
                console.error(`Chain Broken: Invalid previousHash for block ${currentBlock.index}`);
                return false;
            }
        }
        return true; // Chain is valid
    }
}

module.exports = Blockchain;