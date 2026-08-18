export interface Queue {
    type: 'postAccount' | 'postTransfer' | 'getTransfer' | 'getAccount',
    
}

const queue = [];
