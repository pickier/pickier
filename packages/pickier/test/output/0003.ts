// nested blocks, arrays/objects, quotes
function a() {
  const arr = [1, 2, 3]
  const obj = {'x':1, 'y':'str'}
  for (let i = 0; i<arr.length; i++) {
    if(arr[i] > 1) {
      console.log('val', arr[i])
    }
  }
}

