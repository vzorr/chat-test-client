import Toast from 'react-native-simple-toast';

export const ApiErrorHandling = (error:any) => {
    if (error.response) {
        Toast.show("Server Error", Toast.SHORT);
      } else if (error.request) {
        Toast.show("No Internet Connection", Toast.SHORT);
      } else {
        Toast.show("Error occured", Toast.SHORT);
      }
}