const admin = require('./firebase'); 
// this for importing the initialized Firebase instance

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const token = authHeader.split(' ')[1]; 
    // tis will extract the token after 'Bearer'

    try {
      const decodedToken = await admin.auth().verifyIdToken(token);
       console.log('Verified user:', decodedToken);
      req.user = decodedToken;
      // Attach the decoded token to the request object
      next(); 
      //route handling
    } catch (error) {
      console.error('Token verification error:', error);
      res.status(401).json({ error: 'Unauthorized' }); 
    }
  } else {
    res.status(401).json({ error: 'No token provided' }); 
  }
};

module.exports = authenticateToken;
