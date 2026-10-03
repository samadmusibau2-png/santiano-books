const router = require("express").Router();

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");


/* =====================================================
   CREATE JWT TOKEN
===================================================== */

function makeToken(user) {

    return jwt.sign(
        {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role
        },

        process.env.JWT_SECRET,

        {
            expiresIn: "7d"
        }
    );

}


/* =====================================================
   REGISTER
===================================================== */

router.post(
    "/register",
    async (req, res, next) => {

        try {

            const {
                name,
                email,
                password
            } = req.body;


            if (
                typeof name !== "string" ||
                typeof email !== "string" ||
                typeof password !== "string"
            ) {

                return res.status(400).json({

                    error:
                        "Name, email and password are required"

                });

            }


            const cleanName =
                name.trim();


            const normalizedEmail =
                email
                    .trim()
                    .toLowerCase();


            if (
                !cleanName ||
                !normalizedEmail ||
                !password
            ) {

                return res.status(400).json({

                    error:
                        "Name, email and password are required"

                });

            }


            if (password.length < 8) {

                return res.status(400).json({

                    error:
                        "Password must be at least 8 characters"

                });

            }


            const db =
                req.app.locals.db;


            const existing =
                await db.query(
                    `
                    SELECT id
                    FROM users
                    WHERE email = $1
                    `,
                    [
                        normalizedEmail
                    ]
                );


            if (existing.rowCount > 0) {

                return res.status(409).json({

                    error:
                        "An account with that email already exists"

                });

            }


            const passwordHash =
                await bcrypt.hash(
                    password,
                    12
                );


            const result =
                await db.query(
                    `
                    INSERT INTO users
                        (
                            full_name,
                            email,
                            password_hash
                        )
                    VALUES
                        (
                            $1,
                            $2,
                            $3
                        )
                    RETURNING
                        id,
                        full_name,
                        email,
                        role,
                        created_at
                    `,
                    [
                        cleanName,
                        normalizedEmail,
                        passwordHash
                    ]
                );


            const row =
                result.rows[0];


            const user = {

                id:
                    row.id,

                name:
                    row.full_name,

                email:
                    row.email,

                role:
                    row.role,

                created_at:
                    row.created_at

            };


            const token =
                makeToken(user);


            res.status(201).json({

                user,

                token

            });


        } catch (error) {

            next(error);

        }

    }
);


/* =====================================================
   LOGIN
===================================================== */

router.post(
    "/login",
    async (req, res, next) => {

        try {

            const {
                email,
                password
            } = req.body;


            if (
                typeof email !== "string" ||
                typeof password !== "string"
            ) {

                return res.status(400).json({

                    error:
                        "Email and password are required"

                });

            }


            const normalizedEmail =
                email
                    .trim()
                    .toLowerCase();


            if (
                !normalizedEmail ||
                !password
            ) {

                return res.status(400).json({

                    error:
                        "Email and password are required"

                });

            }


            const db =
                req.app.locals.db;


            const result =
                await db.query(
                    `
                    SELECT
                        id,
                        full_name,
                        email,
                        password_hash,
                        role,
                        created_at
                    FROM users
                    WHERE email = $1
                    `,
                    [
                        normalizedEmail
                    ]
                );


            if (result.rowCount === 0) {

                return res.status(401).json({

                    error:
                        "Invalid email or password"

                });

            }


            const row =
                result.rows[0];


            const validPassword =
                await bcrypt.compare(
                    password,
                    row.password_hash
                );


            if (!validPassword) {

                return res.status(401).json({

                    error:
                        "Invalid email or password"

                });

            }


            const user = {

                id:
                    row.id,

                name:
                    row.full_name,

                email:
                    row.email,

                role:
                    row.role,

                created_at:
                    row.created_at

            };


            const token =
                makeToken(user);


            res.json({

                user,

                token

            });


        } catch (error) {

            next(error);

        }

    }
);


/* =====================================================
   EXPORT ROUTER
===================================================== */

module.exports = router;